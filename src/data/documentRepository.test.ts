import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addDocument, listDocuments } from './documentRepository'
import { DOCUMENT_MAX_BYTES } from '../domain/attachment'
import { FILE_STORAGE_MAX_BYTES } from '../domain/storedFile'

const pdf = new TextEncoder().encode('%PDF-1.7\nSynthetic document\n%%EOF\n')
const values = { date: '2026-10-14', title: '  Синтетический документ  ', kind: 'lab', note: '  Синтетическая заметка  ' }
const connections: DiaryDatabase[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-documents-${String(++sequence)}`)
  connections.push(database)
  return database
}

beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('проверяет метаданные до чтения файла или открытия транзакции', async () => {
  const database = createDatabase()
  const input = new NativeBlob([pdf], { type: 'application/pdf' })
  const slice = vi.spyOn(input, 'slice')
  const transaction = vi.spyOn(database, 'transaction')
  for (const metadata of [null, { ...values, date: '2026-10-15' }, { ...values, date: '2026-02-30' }, { ...values, title: ' ' }, { ...values, kind: 'unknown' }, { ...values, extra: true }]) {
    await expect(addDocument(metadata, input, database)).rejects.toThrow()
  }
  expect(slice).not.toHaveBeenCalled()
  expect(transaction).not.toHaveBeenCalled()
  expect(await database.documents.count()).toBe(0)
  expect(await database.files.count()).toBe(0)
})

it('проверяет PDF до RW, сохраняет исходные байты и сортирует карточки после reopen', async () => {
  const database = createDatabase()
  const input = new NativeBlob([pdf])
  const originalSlice = input.slice.bind(input)
  const transaction = vi.spyOn(database, 'transaction')
  vi.spyOn(input, 'slice').mockImplementation((start, end, type) => {
    expect(transaction).not.toHaveBeenCalled()
    expect(Dexie.currentTransaction).toBeNull()
    return originalSlice(start, end, type)
  })
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000101').mockReturnValueOnce('00000000-0000-4000-8000-000000000303')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000102').mockReturnValueOnce('00000000-0000-4000-8000-000000000301')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000103').mockReturnValueOnce('00000000-0000-4000-8000-000000000302')
  const old = await addDocument({ ...values, date: '2026-10-12' }, input, database)
  const current = await addDocument({ ...values, kind: 'report' }, new NativeBlob([pdf]), database)
  const sameDate = await addDocument({ ...values, kind: 'imaging', note: '' }, new NativeBlob([pdf]), database)
  expect(current).toMatchObject({ title: 'Синтетический документ', kind: 'report', note: 'Синтетическая заметка' })
  database.close()
  const reopened = new DiaryDatabase(database.name)
  connections.push(reopened)
  expect(await listDocuments(reopened)).toEqual([current, sameDate, old])
  const file = await reopened.files.get(current.fileId)
  if (!file) throw new Error('Синтетический документ утрачен после reopen')
  expect(file).toMatchObject({ id: current.fileId, purpose: 'document', mime: 'application/pdf', size: pdf.length })
  expect(file.blob.type).toBe('application/pdf')
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(pdf))
  expect(await reopened.files.count()).toBe(3)
})

it('не создаёт карточку или файл при неподдерживаемом содержимом, подмене MIME и отказе чтения', async () => {
  const database = createDatabase()
  const transaction = vi.spyOn(database, 'transaction')
  for (const input of [null, new NativeBlob([]), new NativeBlob(['<html>Synthetic</html>'], { type: 'application/pdf' }), new NativeBlob([pdf], { type: 'image/jpeg' })]) {
    await expect(addDocument(values, input, database)).rejects.toThrow()
  }
  const unreadable = new NativeBlob([pdf], { type: 'application/pdf' })
  vi.spyOn(unreadable, 'slice').mockImplementation(() => { throw new Error('Синтетическое закрытое содержимое') })
  await expect(addDocument(values, unreadable, database)).rejects.toMatchObject({ message: 'Не удалось прочитать вложение' })
  expect(transaction).not.toHaveBeenCalled()
  expect(await database.documents.count()).toBe(0)
  expect(await database.files.count()).toBe(0)
})

it('откатывает добавленный файл при позднем отказе documents creating-hook', async () => {
  const database = createDatabase()
  const original = await addDocument({ ...values, date: '2026-10-13' }, new NativeBlob([pdf]), database)
  function fail() {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический отказ карточки документа')
  }
  database.documents.hook('creating', fail)
  await expect(addDocument(values, new NativeBlob([pdf]), database)).rejects.toThrow('Синтетический отказ карточки документа')
  database.documents.hook('creating').unsubscribe(fail)
  expect(await listDocuments(database)).toEqual([original])
  expect(await database.files.count()).toBe(1)
  expect((await database.files.toArray())[0]?.id).toBe(original.fileId)
})

it('допускает пять документов по 20 MiB и не создаёт шестую карточку при общей квоте 100 MiB', async () => {
  const database = createDatabase()
  const header = new TextEncoder().encode('%PDF-2.0\n')
  const end = new TextEncoder().encode('\n%%EOF\n')
  const large = new NativeBlob([header, new Uint8Array(DOCUMENT_MAX_BYTES - header.length - end.length), end], { type: 'application/pdf' })
  for (let index = 1; index <= 5; index++) await addDocument({ ...values, title: `Синтетический документ ${String(index)}` }, large, database)
  expect((await database.files.toArray()).reduce((sum, file) => sum + file.size, 0)).toBe(FILE_STORAGE_MAX_BYTES)
  await expect(addDocument(values, new NativeBlob([pdf]), database)).rejects.toThrow('Вложения превышают общий предел 100 MiB')
  expect(await database.documents.count()).toBe(5)
  expect(await database.files.count()).toBe(5)
})

it('уникальный fileId не позволяет двум карточкам ссылаться на один файл', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  await expect(database.documents.add({ ...document, id: '00000000-0000-4000-8000-000000000999' })).rejects.toMatchObject({ name: 'ConstraintError' })
  expect(await listDocuments(database)).toEqual([document])
  expect(await database.files.count()).toBe(1)
})

it('валидирует сохранённые карточки и отвергает будущую дату, неверную категорию, fileId или поля', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  for (const corrupted of [{ ...document, date: '2026-10-15' }, { ...document, kind: 'unknown' }, { ...document, fileId: 'unknown' }, { ...document, extra: true }]) {
    await database.table<unknown, string>('documents').put(corrupted)
    await expect(listDocuments(database)).rejects.toThrow()
  }
  await database.documents.put(document)
  expect(await listDocuments(database)).toEqual([document])
})

it('читает и добавляет документы через default singleton только в тестовом режиме', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  expect(await listDocuments()).toEqual([])
  const document = await addDocument({ ...values, kind: 'other' }, new NativeBlob([pdf]))
  expect(await listDocuments()).toEqual([document])
  expect((await db.files.get(document.fileId))?.purpose).toBe('document')
})

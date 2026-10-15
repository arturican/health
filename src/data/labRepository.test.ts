import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addLabResult, listLabResults } from './labRepository'
import { addDocument, deleteDocument } from './documentRepository'

const pdf = new TextEncoder().encode('%PDF-1.7\nSynthetic laboratory document\n%%EOF\n')
const documentInput = { date: '2026-10-14', title: 'Синтетический документ-источник', kind: 'lab', note: '' }
const values = {
  date: '2026-10-14', name: '  Синтетический показатель  ', value: { type: 'number', number: 0, operator: 'eq' },
  unit: '  синт. ед.  ', reference: '  Как в синтетическом бланке: 1–5  ', note: '  Синтетическая заметка  ',
}
const connections: DiaryDatabase[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-labs-${String(++sequence)}`)
  connections.push(database)
  return database
}
function source(database: DiaryDatabase) { return addDocument(documentInput, new NativeBlob([pdf], { type: 'application/pdf' }), database) }

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

it('сохраняет ноль, отрицательное число с оператором и текст, сортируя только показатели выбранного документа после reopen', async () => {
  const database = createDatabase()
  const document = await source(database)
  const other = await source(database)
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000303')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000301')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000302')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000304')
  const negative = await addLabResult({ ...values, documentId: document.id, date: '2026-10-12', value: { type: 'number', number: -12.5, operator: 'lte' } }, database)
  const text = await addLabResult({ ...values, documentId: document.id, value: { type: 'text', text: '  Синтетический текст результата  ' }, unit: '', reference: '' }, database)
  const zero = await addLabResult({ ...values, documentId: document.id }, database)
  const unrelated = await addLabResult({ ...values, documentId: other.id, value: { type: 'number', number: 7.25, operator: 'gt' } }, database)
  expect(zero).toMatchObject({ name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: 'синт. ед.', reference: 'Как в синтетическом бланке: 1–5', note: 'Синтетическая заметка' })
  expect(text.value).toEqual({ type: 'text', text: 'Синтетический текст результата' })
  expect(negative.value).toEqual({ type: 'number', number: -12.5, operator: 'lte' })
  database.close()
  const reopened = new DiaryDatabase(database.name)
  connections.push(reopened)
  expect(await listLabResults(document.id, reopened)).toEqual([text, zero, negative])
  expect(await listLabResults(other.id, reopened)).toEqual([unrelated])
  expect(await reopened.documents.get(document.id)).toEqual(document)
  const file = await reopened.files.get(document.fileId)
  if (!file) throw new Error('Синтетический документ-источник утрачен')
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(pdf))
  expect(await reopened.files.count()).toBe(2)
})

it('валидирует неизвестный payload, будущую дату и ID до записи или запроса', async () => {
  const database = createDatabase()
  const document = await source(database)
  const valid = { ...values, documentId: document.id }
  const transaction = vi.spyOn(database, 'transaction')
  for (const input of [
    null, { ...valid, date: '2026-10-15' }, { ...valid, documentId: 'unknown' },
    { ...valid, value: { type: 'number', number: Infinity, operator: 'eq' } },
    { ...valid, value: { type: 'number', number: NaN, operator: 'eq' } },
    { ...valid, value: { type: 'text', text: 'Синтетический текст', number: 1 } }, { ...valid, extra: true },
  ]) await expect(addLabResult(input, database)).rejects.toThrow()
  expect(transaction).not.toHaveBeenCalled()
  const where = vi.spyOn(database.labResults, 'where')
  for (const id of [null, 'unknown', 1, {}]) await expect(listLabResults(id, database)).rejects.toThrow()
  expect(where).not.toHaveBeenCalled()
  expect(await database.labResults.count()).toBe(0)
  expect(await database.documents.get(document.id)).toEqual(document)
  expect(await database.files.count()).toBe(1)
})

it('не добавляет показатель без документа-источника или при повреждённой карточке документа', async () => {
  const database = createDatabase()
  const document = await source(database)
  const missing = '00000000-0000-4000-8000-000000000999'
  await expect(addLabResult({ ...values, documentId: missing }, database)).rejects.toThrow('Документ-источник не найден')
  expect(await listLabResults(missing, database)).toEqual([])
  const corrupted = { ...document, kind: 'unknown' }
  await database.table<unknown, string>('documents').put(corrupted)
  await expect(addLabResult({ ...values, documentId: document.id }, database)).rejects.toThrow()
  expect(await database.table<unknown, string>('documents').get(document.id)).toEqual(corrupted)
  expect(await database.labResults.count()).toBe(0)
  expect(await database.files.count()).toBe(1)
})

it('повторно валидирует сохранённые показатели и не включает повреждённую запись в список', async () => {
  const database = createDatabase()
  const document = await source(database)
  const result = await addLabResult({ ...values, documentId: document.id }, database)
  for (const corrupted of [{ ...result, date: '2026-10-15' }, { ...result, value: { type: 'number', number: Infinity, operator: 'eq' } }, { ...result, extra: true }]) {
    await database.table<unknown, string>('labResults').put(corrupted)
    await expect(listLabResults(document.id, database)).rejects.toThrow()
  }
  await database.labResults.put(result)
  expect(await listLabResults(document.id, database)).toEqual([result])
})

it('поздний отказ labResults creating-hook откатывает показатель, сохраняя прежний результат, документ и файл', async () => {
  const database = createDatabase()
  const document = await source(database)
  const existing = await addLabResult({ ...values, documentId: document.id }, database)
  function fail() {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический отказ записи показателя')
  }
  database.labResults.hook('creating', fail)
  await expect(addLabResult({ ...values, documentId: document.id, name: 'Второй синтетический показатель' }, database)).rejects.toThrow('Синтетический отказ записи показателя')
  database.labResults.hook('creating').unsubscribe(fail)
  expect(await listLabResults(document.id, database)).toEqual([existing])
  expect(await database.documents.get(document.id)).toEqual(document)
  expect(await database.files.count()).toBe(1)
})

it('обычное удаление документа с показателями блокируется, а без показателей сохраняет прежнее поведение', async () => {
  const database = createDatabase()
  const document = await source(database)
  const result = await addLabResult({ ...values, documentId: document.id }, database)
  await expect(deleteDocument(document.id, database)).rejects.toThrow('Нельзя удалить документ с показателями без отдельного подтверждения')
  expect(await database.documents.get(document.id)).toEqual(document)
  expect(await listLabResults(document.id, database)).toEqual([result])
  expect(await database.files.count()).toBe(1)
  await database.labResults.delete(result.id)
  await deleteDocument(document.id, database)
  expect(await database.documents.count()).toBe(0)
  expect(await database.files.count()).toBe(0)
  expect(await database.labResults.count()).toBe(0)
})

it.each([false, true])('конкурентные добавление показателя и удаление документа не оставляют осиротевших записей, deleteFirst=%s', async deleteFirst => {
  const database = createDatabase()
  const document = await source(database)
  const add = () => addLabResult({ ...values, documentId: document.id }, database)
  const remove = () => deleteDocument(document.id, database)
  const settled = await Promise.allSettled(deleteFirst ? [remove(), add()] : [add(), remove()])
  expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const documents = await database.documents.toArray()
  const results = await database.labResults.toArray()
  if (results.length) {
    expect(results).toHaveLength(1)
    expect(results[0]?.documentId).toBe(document.id)
    expect(documents).toEqual([document])
    expect(await database.files.count()).toBe(1)
  } else {
    expect(documents).toEqual([])
    expect(await database.files.count()).toBe(0)
  }
})

it('добавляет и читает показатели через default singleton только в тестовом режиме', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  const document = await addDocument(documentInput, new NativeBlob([pdf], { type: 'application/pdf' }))
  const result = await addLabResult({ ...values, documentId: document.id })
  expect(await listLabResults(document.id)).toEqual([result])
  await expect(deleteDocument(document.id)).rejects.toThrow('Нельзя удалить документ с показателями без отдельного подтверждения')
  expect(await db.files.count()).toBe(1)
})

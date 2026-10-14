import { Blob as NativeBlob, File as NativeFile, Buffer } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { getFile, prepareFile, savePreparedFile } from './fileRepository'
import { DOCUMENT_MAX_BYTES } from '../domain/attachment'
import { FILE_STORAGE_MAX_BYTES } from '../domain/storedFile'

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKz8AAAAASUVORK5CYII=', 'base64'))
const connections: DiaryDatabase[] = []
let sequence = 0
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-files-${String(++sequence)}`)
  connections.push(database)
  return database
}

beforeEach(() => { vi.stubGlobal('Blob', NativeBlob) })
afterEach(async () => {
  vi.restoreAllMocks()
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.unstubAllGlobals()
})

it('проверяет вход до DB и сохраняет подготовленный файл через тестовый singleton', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  const transaction = vi.spyOn(db, 'transaction')
  for (const input of [null, new NativeBlob([]), new NativeBlob(['<svg/>'], { type: 'image/png' })]) {
    await expect(prepareFile(input, 'photo')).rejects.toThrow()
  }
  await expect(prepareFile(new NativeBlob([png]), 'unknown')).rejects.toThrow()
  const prepared = await prepareFile(new NativeFile([png], 'synthetic.exe'), 'photo')
  expect(prepared.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
  expect(prepared).toMatchObject({ purpose: 'photo', mime: 'image/png', size: png.length })
  expect(prepared.blob.type).toBe('image/png')
  expect(transaction).not.toHaveBeenCalled()
  transaction.mockRestore()
  expect(await db.files.count()).toBe(0)
  await savePreparedFile(prepared)
  expect((await getFile(prepared.id))?.mime).toBe('image/png')
  expect(await db.files.count()).toBe(1)
})

it('сохраняет UUID, метаданные и байты после закрытия и повторного открытия базы', async () => {
  const database = createDatabase()
  const prepared = await prepareFile(new NativeBlob([png], { type: 'image/png' }), 'document')
  await savePreparedFile(prepared, database)
  database.close()
  const reopened = new DiaryDatabase(database.name)
  connections.push(reopened)
  const stored = await getFile(prepared.id, reopened)
  expect(stored).toMatchObject({ id: prepared.id, purpose: 'document', mime: 'image/png', size: png.length })
  if (stored === null) throw new Error('Синтетический файл не найден')
  expect(stored.blob.type).toBe('image/png')
  expect(Array.from(new Uint8Array(await stored.blob.arrayBuffer()))).toEqual(Array.from(png))
})

it('возвращает null для отсутствующего UUID и не читает хранилище при неверном ID', async () => {
  const database = createDatabase()
  expect(await getFile(id(1), database)).toBeNull()
  const get = vi.spyOn(database.files, 'get')
  for (const invalid of [null, 'unknown', 1, {}]) await expect(getFile(invalid, database)).rejects.toThrow()
  expect(get).not.toHaveBeenCalled()
})

it('отвергает повреждённые метаданные и содержимое, не возвращая непроверенный файл', async () => {
  const database = createDatabase()
  const prepared = await prepareFile(new NativeBlob([png], { type: 'image/png' }), 'photo')
  const unsupported = new NativeBlob(['<html>Synthetic</html>'], { type: 'image/png' })
  const truncated = new NativeBlob([png.slice(0, -1)], { type: 'image/png' })
  const records: unknown[] = [
    { ...prepared, size: prepared.size + 1 }, { ...prepared, extra: true },
    { ...prepared, blob: unsupported, size: unsupported.size },
    { ...prepared, blob: truncated, size: truncated.size },
  ]
  for (const record of records) {
    await database.table<unknown, string>('files').put(record)
    await expect(getFile(prepared.id, database)).rejects.toThrow()
  }
  const next = await prepareFile(new NativeBlob([png]), 'photo')
  await database.table<unknown, string>('files').put({ ...prepared, size: prepared.size + 1 })
  await expect(savePreparedFile(next, database)).rejects.toThrow('Метаданные вложения не совпадают с файлом')
  expect(await database.files.count()).toBe(1)
  expect(await database.files.get(next.id)).toBeUndefined()
})

it('не скрывает отказ хранилища, а ошибки чтения Blob показывает без исходных деталей', async () => {
  const database = createDatabase()
  const prepared = await prepareFile(new NativeBlob([png], { type: 'image/png' }), 'photo')
  const get = vi.spyOn(database.files, 'get')
  get.mockRejectedValueOnce(new DOMException('Синтетический отказ хранилища', 'UnknownError'))
  await expect(getFile(prepared.id, database)).rejects.toMatchObject({ name: 'UnknownError' })
  const unreadable = new NativeBlob([png], { type: 'image/png' })
  vi.spyOn(unreadable, 'slice').mockImplementation(() => { throw new Error('Синтетическое закрытое содержимое') })
  get.mockResolvedValueOnce({ ...prepared, blob: unreadable })
  await expect(getFile(prepared.id, database)).rejects.toMatchObject({ message: 'Не удалось прочитать вложение' })
})

it('допускает ровно 100 MiB суммарно и атомарно отвергает дополнительный файл', async () => {
  const database = createDatabase()
  const header = new TextEncoder().encode('%PDF-2.0\n')
  const end = new TextEncoder().encode('\n%%EOF\n')
  const large = await prepareFile(new NativeBlob([header, new Uint8Array(DOCUMENT_MAX_BYTES - header.length - end.length), end], { type: 'application/pdf' }), 'document')
  for (let index = 1; index <= 5; index++) await savePreparedFile({ ...large, id: id(index) }, database)
  expect((await database.files.toArray()).reduce((sum, file) => sum + file.size, 0)).toBe(FILE_STORAGE_MAX_BYTES)
  const additional = await prepareFile(new NativeBlob([png]), 'photo')
  await expect(savePreparedFile(additional, database)).rejects.toThrow('Вложения превышают общий предел 100 MiB')
  expect(await database.files.count()).toBe(5)
  expect(await database.files.get(additional.id)).toBeUndefined()
  expect((await getFile(id(5), database))?.size).toBe(DOCUMENT_MAX_BYTES)
})

it('дубли UUID вызывают ConstraintError без перезаписи исходного файла', async () => {
  const database = createDatabase()
  const prepared = await prepareFile(new NativeBlob([png]), 'photo')
  await savePreparedFile(prepared, database)
  await expect(savePreparedFile({ ...prepared, purpose: 'document' }, database)).rejects.toMatchObject({ name: 'ConstraintError' })
  expect(await database.files.count()).toBe(1)
  expect((await getFile(prepared.id, database))?.purpose).toBe('photo')
})

it('откатывает файл и соседнюю запись при позднем отказе вложенной транзакции', async () => {
  const database = createDatabase()
  const prepared = await prepareFile(new NativeBlob([png]), 'photo')
  const original = { id: 'fixture', value: 'Синтетическое исходное значение' }
  await database.metadata.add(original)
  await expect(database.transaction('rw', database.files, database.metadata, async () => {
    await database.metadata.put({ ...original, value: 'Синтетическое изменённое значение' })
    await savePreparedFile(prepared, database)
    expect(await database.files.count()).toBe(1)
    await database.metadata.add(original)
  })).rejects.toMatchObject({ name: 'ConstraintError' })
  expect(await database.files.count()).toBe(0)
  expect(await database.metadata.toArray()).toEqual([original])
})

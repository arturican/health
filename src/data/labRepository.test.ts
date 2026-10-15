import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addLabResult, deleteLabResult, listLabResults, updateLabResult } from './labRepository'
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

it('правит все поля и меняет число на текст и обратно без смены ID, источника или оригинального файла', async () => {
  const database = createDatabase()
  const document = await source(database)
  const neighbor = await addLabResult({ ...values, documentId: document.id, date: '2026-10-12', name: 'Соседний синтетический показатель' }, database)
  const result = await addLabResult({ ...values, documentId: document.id, date: '2026-10-12' }, database)
  const text = { documentId: document.id, date: '2026-10-14', name: 'Изменённый показатель', value: { type: 'text', text: 'Изменённый синтетический текст' }, unit: '', reference: 'Буквальный новый референс', note: 'Изменённая заметка' }
  await updateLabResult(result.id, { ...text, name: `  ${text.name}  `, value: { type: 'text', text: `  ${text.value.text}  ` } }, database)
  expect(await listLabResults(document.id, database)).toEqual([{ ...text, id: result.id }, neighbor])
  const number = { ...text, date: '2026-10-13', value: { type: 'number', number: -0.00001, operator: 'gte' }, unit: 'синт. единицы', reference: '', note: '' }
  await updateLabResult(result.id, number, database)
  expect(await listLabResults(document.id, database)).toEqual([{ ...number, id: result.id }, neighbor])
  expect(await database.documents.get(document.id)).toEqual(document)
  const file = await database.files.get(document.fileId)
  if (!file) throw new Error('Синтетический оригинал утрачен при правке показателя')
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(pdf))
  expect(await database.files.count()).toBe(1)
})

it('валидирует ID и неверные поля до RW, отклоняет отсутствующий показатель и смену documentId', async () => {
  const database = createDatabase()
  const document = await source(database)
  const other = await source(database)
  const valid = { ...values, documentId: document.id }
  const result = await addLabResult(valid, database)
  const transaction = vi.spyOn(database, 'transaction')
  for (const id of [null, 'unknown', 1, {}]) {
    await expect(updateLabResult(id, valid, database)).rejects.toThrow()
    await expect(deleteLabResult(id, database)).rejects.toThrow()
  }
  for (const input of [null, { ...valid, date: '2026-10-15' }, { ...valid, value: { type: 'number', number: NaN, operator: 'eq' } }, { ...valid, extra: true }]) {
    await expect(updateLabResult(result.id, input, database)).rejects.toThrow()
  }
  expect(transaction).not.toHaveBeenCalled()
  transaction.mockRestore()
  const missing = '00000000-0000-4000-8000-000000000999'
  await expect(updateLabResult(missing, valid, database)).rejects.toThrow('Показатель не найден')
  await expect(deleteLabResult(missing, database)).rejects.toThrow('Показатель не найден')
  await expect(updateLabResult(result.id, { ...valid, documentId: other.id }, database)).rejects.toThrow('Источник показателя менять нельзя')
  expect(await listLabResults(document.id, database)).toEqual([result])
  expect(await listLabResults(other.id, database)).toEqual([])
  expect(await database.documents.count()).toBe(2)
  expect(await database.files.count()).toBe(2)
})

it('не правит показатель исчезнувшего документа, но позволяет очистить отдельную осиротевшую строку', async () => {
  const database = createDatabase()
  const document = await source(database)
  const input = { ...values, documentId: document.id }
  const result = await addLabResult(input, database)
  await database.documents.delete(document.id)
  await expect(updateLabResult(result.id, { ...input, name: 'Несохранённая правка' }, database)).rejects.toThrow('Документ-источник не найден')
  expect(await database.labResults.get(result.id)).toEqual(result)
  await deleteLabResult(result.id, database)
  expect(await database.labResults.count()).toBe(0)
  expect(await database.documents.count()).toBe(0)
  expect(await database.files.count()).toBe(1)
})

it('отвергает повреждённый документ при правке и повреждённый показатель при правке/удалении', async () => {
  const database = createDatabase()
  const document = await source(database)
  const input = { ...values, documentId: document.id }
  const result = await addLabResult(input, database)
  await database.table<unknown, string>('documents').put({ ...document, kind: 'unknown' })
  await expect(updateLabResult(result.id, input, database)).rejects.toThrow()
  expect(await database.labResults.get(result.id)).toEqual(result)
  await database.documents.put(document)
  const corrupted = { ...result, value: { type: 'number', number: Infinity, operator: 'eq' } }
  await database.table<unknown, string>('labResults').put(corrupted)
  await expect(updateLabResult(result.id, input, database)).rejects.toThrow()
  await expect(deleteLabResult(result.id, database)).rejects.toThrow()
  expect(await database.table<unknown, string>('labResults').get(result.id)).toEqual(corrupted)
  expect(await database.documents.get(document.id)).toEqual(document)
  expect(await database.files.count()).toBe(1)
})

it('поздние updating/deleting hook-отказы сохраняют показатель, документ и файл', async () => {
  const database = createDatabase()
  const document = await source(database)
  const input = { ...values, documentId: document.id }
  const result = await addLabResult(input, database)
  function failUpdate() {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический отказ правки показателя')
  }
  function failDelete() {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический отказ удаления показателя')
  }
  database.labResults.hook('updating', failUpdate)
  await expect(updateLabResult(result.id, { ...input, name: 'Несохранённая правка' }, database)).rejects.toThrow('Синтетический отказ правки показателя')
  database.labResults.hook('updating').unsubscribe(failUpdate)
  expect(await database.labResults.get(result.id)).toEqual(result)
  database.labResults.hook('deleting', failDelete)
  await expect(deleteLabResult(result.id, database)).rejects.toThrow('Синтетический отказ удаления показателя')
  database.labResults.hook('deleting').unsubscribe(failDelete)
  expect(await database.labResults.get(result.id)).toEqual(result)
  expect(await database.documents.get(document.id)).toEqual(document)
  expect(await database.files.count()).toBe(1)
})

it('удаляет только выбранный показатель, сохраняя соседей и оба документа с файлами', async () => {
  const database = createDatabase()
  const document = await source(database)
  const other = await source(database)
  const selected = await addLabResult({ ...values, documentId: document.id }, database)
  const neighbor = await addLabResult({ ...values, documentId: document.id, name: 'Соседний показатель' }, database)
  const unrelated = await addLabResult({ ...values, documentId: other.id }, database)
  await deleteLabResult(selected.id, database)
  expect(await listLabResults(document.id, database)).toEqual([neighbor])
  expect(await listLabResults(other.id, database)).toEqual([unrelated])
  await deleteLabResult(neighbor.id, database)
  expect(await listLabResults(document.id, database)).toEqual([])
  expect(await listLabResults(other.id, database)).toEqual([unrelated])
  expect(await database.documents.count()).toBe(2)
  expect(await database.files.count()).toBe(2)
})

it('правит и удаляет показатель через default singleton после повторного открытия', async () => {
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  const document = await addDocument(documentInput, new NativeBlob([pdf], { type: 'application/pdf' }))
  const input = { ...values, documentId: document.id }
  const result = await addLabResult(input)
  await updateLabResult(result.id, { ...input, value: { type: 'text', text: 'Синтетический изменённый текст' } })
  expect((await listLabResults(document.id))[0]?.value).toEqual({ type: 'text', text: 'Синтетический изменённый текст' })
  await deleteLabResult(result.id)
  expect(await listLabResults(document.id)).toEqual([])
  expect(await db.documents.get(document.id)).toEqual(document)
  expect(await db.files.count()).toBe(1)
  await deleteDocument(document.id)
  expect(await db.documents.count()).toBe(0)
  expect(await db.files.count()).toBe(0)
})

import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addDocument, countDocumentResults, deleteDocument, deleteDocumentWithResults, listDocuments, updateDocument } from './documentRepository'
import { prepareFile } from './fileRepository'
import { addLabResult, deleteLabResult, listLabResults } from './labRepository'
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
function labInput(documentId: string, name = 'Синтетический показатель') {
  return { documentId, date: '2026-10-14', name, value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' }
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

it('правит дату, название, категорию и заметку без изменения fileId или оригинальных байтов', async () => {
  const database = createDatabase()
  const neighbor = await addDocument({ ...values, date: '2026-10-13', title: 'Соседний синтетический документ' }, new NativeBlob([pdf]), database)
  const document = await addDocument({ ...values, date: '2026-10-12' }, new NativeBlob([pdf]), database)
  const changed = { date: '2026-10-14', title: 'Изменённый синтетический документ', kind: 'report', note: '' }
  await updateDocument(document.id, { ...changed, title: `  ${changed.title}  ` }, database)
  expect(await listDocuments(database)).toEqual([{ ...document, ...changed }, neighbor])
  expect(await database.files.count()).toBe(2)
  const file = await database.files.get(document.fileId)
  if (!file) throw new Error('Синтетический файл утрачен при правке')
  expect(file).toMatchObject({ id: document.fileId, purpose: 'document', mime: 'application/pdf', size: pdf.length })
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(pdf))
})

it('валидирует ID и метаданные до RW, а отсутствующая карточка не меняет остальные записи', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  const transaction = vi.spyOn(database, 'transaction')
  for (const invalid of [null, 'unknown', 1, {}]) {
    await expect(updateDocument(invalid, values, database)).rejects.toThrow()
    await expect(deleteDocument(invalid, database)).rejects.toThrow()
  }
  for (const input of [{ ...values, date: '2026-10-15' }, { ...values, kind: 'unknown' }, { ...values, fileId: document.fileId }]) {
    await expect(updateDocument(document.id, input, database)).rejects.toThrow()
  }
  expect(transaction).not.toHaveBeenCalled()
  transaction.mockRestore()
  const missing = '00000000-0000-4000-8000-000000000999'
  await expect(updateDocument(missing, values, database)).rejects.toThrow('Документ не найден')
  await expect(deleteDocument(missing, database)).rejects.toThrow('Документ не найден')
  expect(await listDocuments(database)).toEqual([document])
  expect(await database.files.count()).toBe(1)
})

it('удаляет документ и его файл, сохраняя соседний документ и отдельную фотографию', async () => {
  const database = createDatabase()
  const selected = await addDocument(values, new NativeBlob([pdf]), database)
  const neighbor = await addDocument({ ...values, date: '2026-10-13' }, new NativeBlob([pdf]), database)
  const photoBytes = new Uint8Array([255, 216, 255, 224, 0, 4, 1, 2, 255, 217])
  const photoFile = await prepareFile(new NativeBlob([photoBytes], { type: 'image/jpeg' }), 'photo')
  await database.files.add(photoFile)
  const photo = { id: '00000000-0000-4000-8000-000000000888', fileId: photoFile.id, date: '2026-10-14', title: 'Синтетическое фото', note: '', width: 320, height: 240 }
  await database.photos.add(photo)
  await deleteDocument(selected.id, database)
  expect(await listDocuments(database)).toEqual([neighbor])
  expect(await database.files.get(selected.fileId)).toBeUndefined()
  expect((await database.files.toArray()).map(file => file.id).sort()).toEqual([neighbor.fileId, photoFile.id].sort())
  expect(await database.photos.toArray()).toEqual([photo])
  await database.files.delete(neighbor.fileId)
  await deleteDocument(neighbor.id, database)
  expect(await listDocuments(database)).toEqual([])
  expect((await database.files.toArray()).map(file => file.id)).toEqual([photoFile.id])
  expect(await database.photos.toArray()).toEqual([photo])
})

it('откатывает уже начатое удаление документа при позднем отказе files deleting-hook', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  let documentDeleteStarted = false
  function observeDocumentDelete() { documentDeleteStarted = true }
  function failFileDelete() {
    expect(documentDeleteStarted).toBe(true)
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический поздний отказ удаления файла')
  }
  database.documents.hook('deleting', observeDocumentDelete)
  database.files.hook('deleting', failFileDelete)
  await expect(deleteDocument(document.id, database)).rejects.toThrow('Синтетический поздний отказ удаления файла')
  database.documents.hook('deleting').unsubscribe(observeDocumentDelete)
  database.files.hook('deleting').unsubscribe(failFileDelete)
  expect(await listDocuments(database)).toEqual([document])
  const file = await database.files.get(document.fileId)
  if (!file) throw new Error('Синтетический файл не восстановлен при откате')
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(pdf))
  expect(await database.files.count()).toBe(1)
})

it('не правит и не удаляет повреждённую карточку, сохраняя её файл', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  const corrupted = { ...document, kind: 'unknown' }
  await database.table<unknown, string>('documents').put(corrupted)
  await expect(updateDocument(document.id, values, database)).rejects.toThrow()
  await expect(deleteDocument(document.id, database)).rejects.toThrow()
  expect(await database.table<unknown, string>('documents').get(document.id)).toEqual(corrupted)
  expect(await database.files.count()).toBe(1)
})

it('правит и удаляет документ через default singleton после его повторного открытия', async () => {
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  const document = await addDocument(values, new NativeBlob([pdf]))
  await updateDocument(document.id, { ...values, title: 'Изменённый синтетический документ', kind: 'other', note: '' })
  expect(await listDocuments()).toEqual([{ ...document, title: 'Изменённый синтетический документ', kind: 'other', note: '' }])
  await deleteDocument(document.id)
  expect(await listDocuments()).toEqual([])
  expect(await db.files.count()).toBe(0)
})

it('явный каскад удаляет документ, его файл и два показателя, сохраняя чужие документы, показатели и фото', async () => {
  const database = createDatabase()
  const selected = await addDocument(values, new NativeBlob([pdf]), database)
  const neighbor = await addDocument({ ...values, title: 'Соседний синтетический документ' }, new NativeBlob([pdf]), database)
  await addLabResult(labInput(selected.id, 'Первый показатель'), database)
  await addLabResult(labInput(selected.id, 'Второй показатель'), database)
  const unrelated = await addLabResult(labInput(neighbor.id), database)
  const photoFile = await prepareFile(new NativeBlob([new Uint8Array([255, 216, 255, 224, 0, 4, 1, 2, 255, 217])], { type: 'image/jpeg' }), 'photo')
  const photo = { id: '00000000-0000-4000-8000-000000000888', fileId: photoFile.id, date: '2026-10-14', title: 'Синтетическое фото', note: '', width: 320, height: 240 }
  await database.files.add(photoFile)
  await database.photos.add(photo)
  expect(await countDocumentResults(selected.id, database)).toBe(2)
  await expect(deleteDocument(selected.id, database)).rejects.toThrow('Нельзя удалить документ с показателями без отдельного подтверждения')
  await deleteDocumentWithResults(selected.id, 2, database)
  expect(await listDocuments(database)).toEqual([neighbor])
  expect(await listLabResults(selected.id, database)).toEqual([])
  expect(await listLabResults(neighbor.id, database)).toEqual([unrelated])
  expect(await database.files.get(selected.fileId)).toBeUndefined()
  expect((await database.files.toArray()).map(file => file.id).sort()).toEqual([neighbor.fileId, photoFile.id].sort())
  expect(await database.photos.toArray()).toEqual([photo])
})

it('явный нулевой count удаляет документ без показателей и не затрагивает соседние записи', async () => {
  const database = createDatabase()
  const selected = await addDocument(values, new NativeBlob([pdf]), database)
  const neighbor = await addDocument(values, new NativeBlob([pdf]), database)
  expect(await countDocumentResults(selected.id, database)).toBe(0)
  await deleteDocumentWithResults(selected.id, 0, database)
  expect(await listDocuments(database)).toEqual([neighbor])
  expect((await database.files.toArray()).map(file => file.id)).toEqual([neighbor.fileId])
  expect(await database.labResults.count()).toBe(0)
})

it('валидирует ID и ожидаемый count до RW и отклоняет отсутствующий или повреждённый документ', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  const result = await addLabResult(labInput(document.id), database)
  const transaction = vi.spyOn(database, 'transaction')
  const where = vi.spyOn(database.labResults, 'where')
  for (const id of [null, 'unknown', 1, {}]) {
    await expect(countDocumentResults(id, database)).rejects.toThrow()
    await expect(deleteDocumentWithResults(id, 1, database)).rejects.toThrow()
  }
  for (const count of [null, '1', -1, 1.5, NaN, Infinity]) await expect(deleteDocumentWithResults(document.id, count, database)).rejects.toThrow()
  expect(transaction).not.toHaveBeenCalled()
  expect(where).not.toHaveBeenCalled()
  transaction.mockRestore()
  where.mockRestore()
  const missing = '00000000-0000-4000-8000-000000000999'
  expect(await countDocumentResults(missing, database)).toBe(0)
  await expect(deleteDocumentWithResults(missing, 0, database)).rejects.toThrow('Документ не найден')
  const corrupted = { ...document, kind: 'unknown' }
  await database.table<unknown, string>('documents').put(corrupted)
  await expect(deleteDocumentWithResults(document.id, 1, database)).rejects.toThrow()
  expect(await database.table<unknown, string>('documents').get(document.id)).toEqual(corrupted)
  expect(await listLabResults(document.id, database)).toEqual([result])
  expect(await database.files.count()).toBe(1)
})

it('требует новое подтверждение при увеличении или уменьшении количества показателей', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  const first = await addLabResult(labInput(document.id, 'Первый показатель'), database)
  const captured = await countDocumentResults(document.id, database)
  const second = await addLabResult(labInput(document.id, 'Второй показатель'), database)
  await expect(deleteDocumentWithResults(document.id, captured, database)).rejects.toThrow('Количество показателей изменилось. Проверьте подтверждение.')
  expect(await database.labResults.count()).toBe(2)
  const updatedCount = await countDocumentResults(document.id, database)
  await deleteLabResult(second.id, database)
  await expect(deleteDocumentWithResults(document.id, updatedCount, database)).rejects.toThrow('Количество показателей изменилось. Проверьте подтверждение.')
  expect(await listLabResults(document.id, database)).toEqual([first])
  expect(await database.documents.get(document.id)).toEqual(document)
  expect(await database.files.count()).toBe(1)
})

it('поздний files deleting-hook откатывает все три таблицы и исходные PDF-байты', async () => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  const first = await addLabResult(labInput(document.id, 'Первый показатель'), database)
  const second = await addLabResult(labInput(document.id, 'Второй показатель'), database)
  let deletedResults = 0
  let deletedDocument = false
  function observeResult() { deletedResults++ }
  function observeDocument() { deletedDocument = true }
  function failFile() {
    expect(deletedResults).toBe(2)
    expect(deletedDocument).toBe(true)
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический поздний отказ каскада')
  }
  database.labResults.hook('deleting', observeResult)
  database.documents.hook('deleting', observeDocument)
  database.files.hook('deleting', failFile)
  await expect(deleteDocumentWithResults(document.id, 2, database)).rejects.toThrow('Синтетический поздний отказ каскада')
  database.labResults.hook('deleting').unsubscribe(observeResult)
  database.documents.hook('deleting').unsubscribe(observeDocument)
  database.files.hook('deleting').unsubscribe(failFile)
  expect(await database.documents.get(document.id)).toEqual(document)
  expect((await database.labResults.toArray()).map(result => result.id).sort()).toEqual([first.id, second.id].sort())
  const file = await database.files.get(document.fileId)
  if (!file) throw new Error('Синтетический файл не восстановлен при каскадном откате')
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(pdf))
  expect(await database.files.count()).toBe(1)
})

it.each([false, true])('конкурентный add после показанного count и каскад не удаляют неподтверждённый результат, deleteFirst=%s', async deleteFirst => {
  const database = createDatabase()
  const document = await addDocument(values, new NativeBlob([pdf]), database)
  await addLabResult(labInput(document.id), database)
  const captured = await countDocumentResults(document.id, database)
  const add = () => addLabResult(labInput(document.id, 'Новый показатель после подтверждения'), database)
  const remove = () => deleteDocumentWithResults(document.id, captured, database)
  const settled = await Promise.allSettled(deleteFirst ? [remove(), add()] : [add(), remove()])
  expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const results = await database.labResults.toArray()
  if (results.length) {
    expect(results).toHaveLength(2)
    expect(results.every(result => result.documentId === document.id)).toBe(true)
    expect(await database.documents.get(document.id)).toEqual(document)
    expect(await database.files.count()).toBe(1)
  } else {
    expect(await database.documents.count()).toBe(0)
    expect(await database.files.count()).toBe(0)
  }
})

it('считает и удаляет каскадом через default singleton после повторного открытия', async () => {
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  const document = await addDocument(values, new NativeBlob([pdf]))
  await addLabResult(labInput(document.id))
  expect(await countDocumentResults(document.id)).toBe(1)
  await deleteDocumentWithResults(document.id, 1)
  expect(await countDocumentResults(document.id)).toBe(0)
  expect(await db.documents.count()).toBe(0)
  expect(await db.labResults.count()).toBe(0)
  expect(await db.files.count()).toBe(0)
})

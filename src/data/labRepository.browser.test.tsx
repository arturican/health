import Dexie from 'dexie'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { addDocument, deleteDocument, listDocuments } from './documentRepository'
import { addLabResult, listLabResults } from './labRepository'
import { getFile, prepareFile } from './fileRepository'
import { formatLabValue } from '../domain/labResult'
import type { DiaryDocument } from '../domain/document'

const documentInput = { date: '2026-10-14', title: 'Синтетический бланк', kind: 'lab', note: '' }
const pdf = new File(['%PDF-1.7\nsynthetic-laboratory-source\n%%EOF\n'], 'synthetic-laboratory.pdf', { type: 'application/pdf' })
const connections: Dexie[] = []
function createDatabase(name = `health-diary-test-labs-browser-${crypto.randomUUID()}`) {
  expect(import.meta.env.MODE).toBe('test')
  expect(name.startsWith('health-diary-test-labs-browser-')).toBe(true)
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
function resultInput(documentId: string) {
  return { documentId, date: '2026-10-14', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: 'условные единицы', reference: 'Как на синтетическом бланке', note: '' }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})

test('число, знак и текст остаются точными, исходный PDF и показатели переживают reopen', async () => {
  const database = createDatabase()
  const source = await addDocument(documentInput, pdf, database)
  const other = await addDocument({ ...documentInput, title: 'Другой синтетический источник' }, pdf, database)
  const fileBefore = await getFile(source.fileId, database)
  const zero = await addLabResult(resultInput(source.id), database)
  const negative = await addLabResult({ ...resultInput(source.id), date: '2026-10-13', name: 'Синтетическое отклонение', value: { type: 'number', number: -0.0000001, operator: 'lte' }, unit: 'мг/л', reference: '≤ 0,0000002; исходный текст', note: 'Без интерпретации' }, database)
  const text = await addLabResult({ ...resultInput(source.id), value: { type: 'text', text: 'Не обнаружено (синтетический образец)' }, unit: '', reference: 'Отрицательный; как на бланке' }, database)
  const separate = await addLabResult({ ...resultInput(other.id), value: { type: 'number', number: 1.23456789, operator: 'gt' } }, database)
  const expected = [zero, negative, text].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  expect(await listLabResults(source.id, database)).toEqual(expected)
  expect(await listLabResults(other.id, database)).toEqual([separate])
  expect(formatLabValue(zero.value)).toBe('0')
  expect(formatLabValue(negative.value)).toBe('≤ -0,0000001')
  expect(formatLabValue(text.value)).toBe('Не обнаружено (синтетический образец)')
  expect(formatLabValue(separate.value)).toBe('> 1,23456789')
  database.close()
  const reopened = createDatabase(database.name)
  expect(await listLabResults(source.id, reopened)).toEqual(expected)
  expect(await listLabResults(other.id, reopened)).toEqual([separate])
  const file = await getFile(source.fileId, reopened)
  if (!file || !fileBefore) throw new Error('Синтетический оригинал должен сохраниться')
  expect(file.blob).toBeInstanceOf(Blob)
  expect({ ...file, blob: null }).toEqual({ ...fileBefore, blob: null })
  expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(new Uint8Array(await pdf.arrayBuffer()))
  expect(await reopened.documents.get(source.id)).toEqual(source)
  expect(await reopened.files.count()).toBe(2)
})

test('миграция IndexedDB v11 в v12 сохраняет документы, Blob и прежние таблицы', async () => {
  const database = createDatabase()
  const previous = new Dexie(database.name)
  connections.push(previous)
  previous.version(11).stores({
    metadata: 'id', profiles: 'id', weights: 'id,&date', products: 'id,name', foodEntries: 'id,date,[date+meal]', nutritionDays: 'date',
    steps: 'date', workouts: 'id,date', energyPlans: 'id,effectiveFrom,&revision', files: 'id,purpose', photos: 'id,date,&fileId', documents: 'id,date,kind,&fileId',
  })
  const legacyFile = await prepareFile(pdf, 'document')
  const source: DiaryDocument = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-13', title: 'Синтетический прежний бланк', kind: 'lab', note: 'Сохранить без изменений', fileId: legacyFile.id }
  const metadata = { id: 'synthetic-preserved', value: source.id }
  const steps = { date: '2026-10-13', count: 0 }
  await previous.table<unknown, string>('files').add(legacyFile)
  await previous.table<unknown, string>('documents').add(source)
  await previous.table<unknown, string>('metadata').add(metadata)
  await previous.table<unknown, string>('steps').add(steps)
  previous.close()
  expect(await database.labResults.count()).toBe(0)
  expect(await listDocuments(database)).toEqual([source])
  const preserved = await getFile(source.fileId, database)
  if (!preserved) throw new Error('Миграция должна сохранить оригинал')
  expect({ ...preserved, blob: null }).toEqual({ ...legacyFile, blob: null })
  expect(new Uint8Array(await preserved.blob.arrayBuffer())).toEqual(new Uint8Array(await pdf.arrayBuffer()))
  expect(await database.metadata.toArray()).toEqual([metadata])
  expect(await database.steps.toArray()).toEqual([steps])
  const result = await addLabResult(resultInput(source.id), database)
  expect(await database.labResults.where('documentId').equals(source.id).toArray()).toEqual([result])
  expect(await database.labResults.where('[documentId+date]').equals([source.id, result.date]).toArray()).toEqual([result])
  expect(await database.files.count()).toBe(1)
})

test('отказы откатываются, показатели блокируют удаление, конкурентные операции не оставляют сирот', async () => {
  const database = createDatabase()
  const source = await addDocument(documentInput, pdf, database)
  const failure = () => { throw new Error('Синтетический поздний отказ показателя') }
  database.labResults.hook('creating', failure)
  await expect(addLabResult(resultInput(source.id), database)).rejects.toThrow('Синтетический поздний отказ показателя')
  database.labResults.hook('creating').unsubscribe(failure)
  expect(await database.labResults.count()).toBe(0)
  expect(await database.documents.get(source.id)).toEqual(source)
  const result = await addLabResult(resultInput(source.id), database)
  await expect(deleteDocument(source.id, database)).rejects.toThrow('Нельзя удалить документ с показателями без отдельного подтверждения')
  expect(await listLabResults(source.id, database)).toEqual([result])
  expect(await database.documents.get(source.id)).toEqual(source)
  const sourceFile = await getFile(source.fileId, database)
  if (!sourceFile) throw new Error('Защищённый оригинал должен остаться')
  expect(new Uint8Array(await sourceFile.blob.arrayBuffer())).toEqual(new Uint8Array(await pdf.arrayBuffer()))
  const disposable = await addDocument({ ...documentInput, title: 'Синтетический откат удаления' }, pdf, database)
  const deleteFailure = () => { throw new Error('Синтетический поздний отказ удаления файла') }
  database.files.hook('deleting', deleteFailure)
  await expect(deleteDocument(disposable.id, database)).rejects.toThrow('Синтетический поздний отказ удаления файла')
  database.files.hook('deleting').unsubscribe(deleteFailure)
  expect(await database.documents.get(disposable.id)).toEqual(disposable)
  expect(await getFile(disposable.fileId, database)).not.toBeNull()
  for (const deleteFirst of [false, true]) {
    const concurrent = await addDocument({ ...documentInput, title: 'Синтетическая конкуренция' }, pdf, database)
    const outcomes = await Promise.allSettled(deleteFirst
      ? [deleteDocument(concurrent.id, database), addLabResult(resultInput(concurrent.id), database)]
      : [addLabResult(resultInput(concurrent.id), database), deleteDocument(concurrent.id, database)])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const addition = outcomes[deleteFirst ? 1 : 0]
    const results = await listLabResults(concurrent.id, database)
    const document = await database.documents.get(concurrent.id)
    const file = await getFile(concurrent.fileId, database)
    if (addition.status === 'fulfilled') {
      expect(results).toHaveLength(1)
      expect(document).toEqual(concurrent)
      expect(file).not.toBeNull()
    } else {
      expect(results).toEqual([])
      expect(document).toBeUndefined()
      expect(file).toBeNull()
    }
  }
  for (const result of await database.labResults.toArray()) expect(await database.documents.get(result.documentId)).toBeDefined()
  const documents = await database.documents.toArray()
  expect((await database.files.toArray()).map(file => file.id).sort()).toEqual(documents.map(document => document.fileId).sort())
})

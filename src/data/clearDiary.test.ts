import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { clearDiary } from './clearDiary'
import { getVisibility } from './visibilityRepository'
import { DEFAULT_VISIBILITY, VISIBILITY_SETTING_ID } from '../domain/visibility'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 2, 0, 1, 1, 1, 17, 0, 255, 217])
const pdf = new Uint8Array(new TextEncoder().encode('%PDF-1.7\nSynthetic source\n%%EOF\n'))
const connections: Dexie[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-clear-${String(++sequence)}`)
  connections.push(database)
  return database
}
async function populate(database: DiaryDatabase) {
  await database.metadata.add({ id: VISIBILITY_SETTING_ID, value: JSON.stringify({ version: 1, showPhotos: false, showDocuments: false }) })
  await database.profiles.add({ id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: null, formulaSex: 'none' })
  await database.weights.add({ id: id(101), date: '2000-01-01', kg: 70 })
  await database.products.add({ id: id(201), name: 'Синтетический продукт', source: '', kcal: 100, protein: 0, fat: null, carbs: 10, archived: true })
  await database.foodEntries.add({ id: id(301), productId: id(201), date: '2000-01-01', meal: 'lunch', grams: 125, note: '', snapshot: { name: 'Прежний продукт', source: '', kcal: 100, protein: 0, fat: null, carbs: 10 } })
  await database.nutritionDays.add({ date: '2000-01-01', complete: false })
  await database.steps.add({ date: '2000-01-01', count: 0 })
  await database.workouts.add({ id: id(401), date: '2000-01-01', kind: 'Синтетическая прогулка', minutes: 10, kcal: null, source: '', note: '' })
  await database.energyPlans.add({ id: id(402), revision: 1, createdOn: '2000-01-01', effectiveFrom: '2000-01-01', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70, weightDate: '2000-01-01', heightCm: 170, age: null, formulaSex: 'none' } })
  await database.files.bulkAdd([
    { id: id(701), purpose: 'photo', mime: 'image/jpeg', size: jpeg.length, blob: new Blob([jpeg], { type: 'image/jpeg' }) },
    { id: id(702), purpose: 'document', mime: 'application/pdf', size: pdf.length, blob: new Blob([pdf], { type: 'application/pdf' }) },
  ])
  await database.photos.add({ id: id(501), fileId: id(701), date: '2000-01-01', title: 'Синтетическое фото', note: '', width: 1, height: 2 })
  await database.documents.add({ id: id(601), fileId: id(702), date: '2000-01-01', title: 'Синтетический бланк', kind: 'lab', note: '' })
  await database.labResults.add({ id: id(801), documentId: id(601), date: '2000-01-01', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' })
}
function counts(database: DiaryDatabase) { return Promise.all(database.tables.map(table => table.count())) }
function snapshot(database: DiaryDatabase) { return Promise.all(database.tables.map(table => database.table<unknown, string>(table.name).toArray())) }

beforeEach(() => { vi.stubGlobal('Blob', NativeBlob) })
afterEach(async () => {
  vi.restoreAllMocks()
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.unstubAllGlobals()
})

it('очищает 13 непустых таблиц одной физической RW-транзакцией, сохраняя схему после reopen', async () => {
  const database = createDatabase()
  await populate(database)
  expect((await counts(database)).every(count => count > 0)).toBe(true)
  const transactions = new Set<IDBTransaction>()
  const deleted = new Set<string>()
  const unsubscribe: (() => void)[] = []
  for (const name of database.tables.map(table => table.name)) {
    const table = database.table<unknown, string>(name)
    function observe() {
      expect(Dexie.currentTransaction.mode).toBe('readwrite')
      transactions.add(Dexie.currentTransaction.idbtrans)
      deleted.add(name)
    }
    table.hook('deleting', observe)
    unsubscribe.push(() => { table.hook('deleting').unsubscribe(observe) })
  }
  await clearDiary(database)
  unsubscribe.forEach(remove => { remove() })
  expect(transactions.size).toBe(1)
  expect(deleted.size).toBe(13)
  expect([...deleted].sort()).toEqual(database.tables.map(table => table.name).sort())
  database.close()
  const reopened = new DiaryDatabase(database.name)
  connections.push(reopened)
  expect(await counts(reopened)).toEqual(Array.from({ length: 13 }, () => 0))
  expect(await getVisibility(reopened)).toEqual(DEFAULT_VISIBILITY)
  await reopened.steps.add({ date: '2000-01-02', count: 1 })
  expect(await reopened.steps.get('2000-01-02')).toEqual({ date: '2000-01-02', count: 1 })
  await clearDiary(reopened)
  expect(await counts(reopened)).toEqual(Array.from({ length: 13 }, () => 0))
})

it('поздний отказ очистки показателей откатывает все 13 таблиц и исходные байты файлов', async () => {
  const database = createDatabase()
  await populate(database)
  const before = await snapshot(database)
  const labTable = database.tables.find(table => table.name === 'labResults')
  if (!labTable) throw new Error('Таблица синтетических показателей отсутствует')
  const failure = vi.spyOn(labTable, 'clear').mockImplementationOnce(() => Dexie.Promise.resolve().then(async () => {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    const others = database.tables.filter(table => table.name !== 'labResults')
    expect(await Promise.all(others.map(table => table.count()))).toEqual(Array.from({ length: 12 }, () => 0))
    expect(await database.labResults.count()).toBe(1)
    throw new DOMException('Синтетический поздний отказ очистки', 'UnknownError')
  }))
  await expect(clearDiary(database)).rejects.toMatchObject({ name: 'UnknownError' })
  failure.mockRestore()
  expect(await snapshot(database)).toEqual(before)
  const files = await database.files.toArray()
  expect(files).toHaveLength(2)
  for (const file of files) expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(file.id === id(701) ? jpeg : pdf))
})

it('не затрагивает отдельную базу браузера', async () => {
  const database = createDatabase()
  await populate(database)
  const neighbor = new Dexie('health-diary-test-unrelated-database')
  neighbor.version(1).stores({ notes: 'id' })
  connections.push(neighbor)
  const notes = neighbor.table<{ id: string; value: string }, string>('notes')
  const note = { id: 'fixture', value: 'Синтетическая запись другой базы' }
  await notes.add(note)
  await clearDiary(database)
  expect(await counts(database)).toEqual(Array.from({ length: 13 }, () => 0))
  expect(await notes.toArray()).toEqual([note])
})

it('очищает повреждённые metadata, Blob и лишний профиль без вызова их валидаторов', async () => {
  const database = createDatabase()
  await populate(database)
  await database.table<unknown, string>('metadata').put({ id: VISIBILITY_SETTING_ID, value: 'Синтетический неверный JSON' })
  await database.table<unknown, string>('files').put({ id: id(701), purpose: 'photo', mime: 'image/jpeg', size: 1, blob: 'not-a-blob' })
  await database.table<unknown, string>('profiles').put({ id: 'foreign', heightCm: 'invalid' })
  await expect(getVisibility(database)).rejects.toThrow()
  await clearDiary(database)
  expect(await counts(database)).toEqual(Array.from({ length: 13 }, () => 0))
  expect(await getVisibility(database)).toEqual(DEFAULT_VISIBILITY)
})

it('по умолчанию очищает только singleton тестового режима', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  await populate(db)
  await clearDiary()
  expect(await counts(db)).toEqual(Array.from({ length: 13 }, () => 0))
})

import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { getVisibility, saveVisibility } from './visibilityRepository'
import { DEFAULT_VISIBILITY, VISIBILITY_SETTING_ID } from '../domain/visibility'
import { restoreTextBackup } from './backupRepository'
import { restoreFullBackup } from './fullBackupRepository'
import type { FullBackup } from '../domain/fullBackup'

const hidden = { version: 1, showPhotos: false, showDocuments: false }
const mixed = { version: 1, showPhotos: false, showDocuments: true }
const metadata = [{ id: 'catalog-seeded', value: 'done' }, { id: 'fixture', value: 'Синтетическая настройка' }]
const empty: FullBackup = {
  format: 'health-diary-full', version: 1,
  text: { format: 'health-diary-text', version: 1, exportedAt: '2000-01-01T00:00:00.000Z', profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] },
  metadata: [], photos: [], documents: [], labResults: [], files: [],
}
const connections: DiaryDatabase[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-visibility-${String(++sequence)}`)
  connections.push(database)
  return database
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
})

it('отсутствующая настройка возвращает независимые defaults без записи или изменения других metadata', async () => {
  const database = createDatabase()
  await database.metadata.bulkAdd(metadata)
  const put = vi.spyOn(database.metadata, 'put')
  const first = await getVisibility(database)
  expect(first).toEqual(DEFAULT_VISIBILITY)
  expect(first).not.toBe(DEFAULT_VISIBILITY)
  first.showPhotos = false
  const second = await getVisibility(database)
  expect(second).toEqual(DEFAULT_VISIBILITY)
  expect(second).not.toBe(first)
  expect(put).not.toHaveBeenCalled()
  expect(await database.metadata.toArray()).toEqual(metadata)
})

it('меняет только свою metadata-запись, сохраняет прочие таблицы и переживает reopen', async () => {
  const database = createDatabase()
  await database.metadata.bulkAdd(metadata)
  await database.steps.add({ date: '2000-01-01', count: 0 })
  await database.workouts.add({ id: '00000000-0000-4000-8000-000000000001', date: '2000-01-01', kind: 'Синтетическая прогулка', minutes: 20, kcal: null, source: '', note: '' })
  const otherTables = database.tables.filter(table => table.name !== 'metadata')
  const before = await Promise.all(otherTables.map(table => table.toArray()))
  const scopes: string[][] = []
  function observe() { scopes.push([...Dexie.currentTransaction.storeNames]) }
  database.metadata.hook('creating', observe)
  await saveVisibility(hidden, database)
  database.metadata.hook('creating').unsubscribe(observe)
  expect(scopes).toEqual([['metadata']])
  await saveVisibility(mixed, database)
  expect(await Promise.all(otherTables.map(table => table.toArray()))).toEqual(before)
  expect((await database.metadata.toArray()).filter(row => row.id !== VISIBILITY_SETTING_ID)).toEqual(metadata)
  expect(await database.metadata.count()).toBe(3)
  database.close()
  const reopened = new DiaryDatabase(database.name)
  connections.push(reopened)
  expect(await getVisibility(reopened)).toEqual(mixed)
  const row = await reopened.metadata.get(VISIBILITY_SETTING_ID)
  if (!row) throw new Error('Синтетическая настройка не сохранена')
  const parsed: unknown = JSON.parse(row.value)
  expect(parsed).toEqual(mixed)
})

it('не записывает неверные значения и не заменяет повреждённое хранилище defaults при чтении', async () => {
  const database = createDatabase()
  await saveVisibility(hidden, database)
  const put = vi.spyOn(database.metadata, 'put')
  for (const input of [null, { ...hidden, version: 2 }, { ...hidden, showPhotos: 'false' }, { ...hidden, showDocuments: 0 }, { ...hidden, extra: true }]) {
    await expect(saveVisibility(input, database)).rejects.toThrow()
  }
  expect(put).not.toHaveBeenCalled()
  expect(await getVisibility(database)).toEqual(hidden)
  put.mockRestore()
  const table = database.table<unknown, string>('metadata')
  for (const corrupted of [
    { id: VISIBILITY_SETTING_ID, value: 'Синтетическая закрытая строка' },
    { id: VISIBILITY_SETTING_ID, value: 1 },
    { id: VISIBILITY_SETTING_ID, value: JSON.stringify({ ...hidden, showDocuments: 'false' }) },
    { id: VISIBILITY_SETTING_ID, value: JSON.stringify(hidden), extra: true },
  ]) {
    await table.put(corrupted)
    await expect(getVisibility(database)).rejects.toThrow()
    expect(await table.get(VISIBILITY_SETTING_ID)).toEqual(corrupted)
  }
})

it('отказ записи оставляет прежнюю настройку и соседние metadata для безопасного повтора', async () => {
  const database = createDatabase()
  await database.metadata.bulkAdd(metadata)
  await saveVisibility(hidden, database)
  function fail() { throw new DOMException('Синтетический отказ записи', 'QuotaExceededError') }
  database.metadata.hook('updating', fail)
  await expect(saveVisibility(mixed, database)).rejects.toMatchObject({ name: 'QuotaExceededError' })
  database.metadata.hook('updating').unsubscribe(fail)
  expect(await getVisibility(database)).toEqual(hidden)
  expect((await database.metadata.toArray()).filter(row => row.id !== VISIBILITY_SETTING_ID)).toEqual(metadata)
  await saveVisibility(mixed, database)
  expect(await getVisibility(database)).toEqual(mixed)
})

it('текстовое восстановление сохраняет видимость, полное применяет флаги либо defaults старой копии', async () => {
  const database = createDatabase()
  await database.metadata.bulkAdd(metadata)
  await saveVisibility(hidden, database)
  await restoreTextBackup(empty.text, database)
  expect(await getVisibility(database)).toEqual(hidden)
  expect(await database.metadata.get('fixture')).toEqual(metadata[1])
  await restoreFullBackup({ ...empty, metadata: [{ id: VISIBILITY_SETTING_ID, value: JSON.stringify(mixed) }] }, database)
  expect(await getVisibility(database)).toEqual(mixed)
  expect(await database.metadata.count()).toBe(1)
  await restoreFullBackup(empty, database)
  expect(await getVisibility(database)).toEqual(DEFAULT_VISIBILITY)
  expect(await database.metadata.count()).toBe(0)
})

it('использует default singleton только тестовой базы и повторно открывает его без потери настройки', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  expect(await getVisibility()).toEqual(DEFAULT_VISIBILITY)
  await saveVisibility(mixed)
  db.close()
  await db.open()
  expect(await getVisibility()).toEqual(mixed)
})

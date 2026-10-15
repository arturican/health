import Dexie from 'dexie'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { getVisibility, saveVisibility } from './visibilityRepository'
import { exportFullBackup, restoreFullBackup } from './fullBackupRepository'
import { restoreTextBackup } from './backupRepository'
import { addDocument } from './documentRepository'
import { addLabResult } from './labRepository'
import { readFullBackup, type FullBackup } from '../domain/fullBackup'
import { DEFAULT_VISIBILITY, VISIBILITY_SETTING_ID, type Visibility } from '../domain/visibility'

const connections: DiaryDatabase[] = []
function createDatabase(name = `health-diary-test-visibility-browser-${crypto.randomUUID()}`) {
  expect(import.meta.env.MODE).toBe('test')
  expect(name.startsWith('health-diary-test-visibility-browser-')).toBe(true)
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
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
async function populate(database: DiaryDatabase) {
  await database.metadata.put({ id: 'synthetic-setting', value: 'Сохранить соседнюю настройку' })
  await database.steps.put({ date: '2026-10-14', count: 0 })
  const document = await addDocument({ date: '2026-10-14', title: 'Синтетический бланк видимости', kind: 'lab', note: '' },
    new Blob(['%PDF-1.7\nsynthetic-visibility-document\n%%EOF\n'], { type: 'application/pdf' }), database)
  await addLabResult({ documentId: document.id, date: document.date, name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' }, database)
  return exportFullBackup(database)
}
async function expectSnapshot(database: DiaryDatabase, expected: FullBackup) {
  const actual = await exportFullBackup(database)
  expect({ ...actual, text: { ...actual.text, exportedAt: expected.text.exportedAt } }).toEqual(expected)
}

test('все сочетания флагов переживают reopen, меняется только их metadata, отказ сохраняет старую настройку', async () => {
  let database = createDatabase()
  expect(await getVisibility(database)).toEqual(DEFAULT_VISIBILITY)
  expect(await database.metadata.count()).toBe(0)
  const before = await populate(database)
  const combinations: Visibility[] = [
    { version: 1, showPhotos: true, showDocuments: true }, { version: 1, showPhotos: false, showDocuments: true },
    { version: 1, showPhotos: true, showDocuments: false }, { version: 1, showPhotos: false, showDocuments: false },
  ]
  for (const visibility of combinations) {
    await saveVisibility(visibility, database)
    expect(await getVisibility(database)).toEqual(visibility)
    database.close()
    database = createDatabase(database.name)
    expect(await getVisibility(database)).toEqual(visibility)
    expect(await database.metadata.get(VISIBILITY_SETTING_ID)).toEqual({ id: VISIBILITY_SETTING_ID, value: JSON.stringify(visibility) })
    expect(await database.metadata.count()).toBe(2)
    const actual = await exportFullBackup(database)
    expect({ ...actual, metadata: before.metadata, text: { ...actual.text, exportedAt: before.text.exportedAt } }).toEqual(before)
    expect(actual.metadata.filter(row => row.id !== VISIBILITY_SETTING_ID)).toEqual(before.metadata)
  }
  const beforeFailure = await exportFullBackup(database)
  const failure = () => { throw new DOMException('synthetic-private-quota-detail', 'QuotaExceededError') }
  database.metadata.hook('updating', failure)
  try {
    await expect(saveVisibility(DEFAULT_VISIBILITY, database)).rejects.toMatchObject({ name: 'QuotaExceededError' })
  } finally { database.metadata.hook('updating').unsubscribe(failure) }
  await expectSnapshot(database, beforeFailure)
  expect(await getVisibility(database)).toEqual({ version: 1, showPhotos: false, showDocuments: false })
  await saveVisibility(DEFAULT_VISIBILITY, database)
  expect(await getVisibility(database)).toEqual(DEFAULT_VISIBILITY)
})

test('повреждённый известный флаг в полной копии отклоняется до записи без раскрытия JSON', async () => {
  const database = createDatabase()
  await populate(database)
  await saveVisibility({ version: 1, showPhotos: false, showDocuments: true }, database)
  const before = await exportFullBackup(database)
  const invalidValues = [
    '{synthetic-private-invalid-json',
    JSON.stringify({ version: 2, showPhotos: true, showDocuments: false }),
    JSON.stringify({ version: 1, showPhotos: 'synthetic-private-string', showDocuments: true }),
    JSON.stringify({ version: 1, showPhotos: true, showDocuments: false, 'synthetic-private-key': true }),
    JSON.stringify({ version: 1, showPhotos: true }),
  ]
  for (const value of invalidValues) {
    const invalid = { ...before, metadata: before.metadata.map(row => row.id === VISIBILITY_SETTING_ID ? { ...row, value } : row) }
    expect(() => readFullBackup(invalid)).toThrow()
    await expect(restoreFullBackup(invalid, database)).rejects.toThrow()
    await expectSnapshot(database, before)
    await database.metadata.put({ id: VISIBILITY_SETTING_ID, value })
    const reason: unknown = await getVisibility(database).catch((error: unknown) => error)
    if (!(reason instanceof Error)) throw new Error('Повреждённая настройка должна отклоняться')
    expect(reason.message).not.toContain('synthetic-private')
    await database.metadata.put({ id: VISIBILITY_SETTING_ID, value: JSON.stringify({ version: 1, showPhotos: false, showDocuments: true }) })
  }
  await expectSnapshot(database, before)
})

test('текстовый импорт сохраняет флаги, полный переносит их, старая полная копия восстанавливает defaults', async () => {
  const database = createDatabase()
  await populate(database)
  const sourceVisibility = { version: 1, showPhotos: false, showDocuments: true }
  await saveVisibility(sourceVisibility, database)
  const source = await exportFullBackup(database)
  const currentVisibility = { version: 1, showPhotos: true, showDocuments: false }
  await saveVisibility(currentVisibility, database)
  await restoreTextBackup(source.text, database)
  expect(await getVisibility(database)).toEqual(currentVisibility)
  expect(await database.metadata.get('synthetic-setting')).toEqual({ id: 'synthetic-setting', value: 'Сохранить соседнюю настройку' })
  await restoreFullBackup(source, database)
  expect(await getVisibility(database)).toEqual(sourceVisibility)
  await expectSnapshot(database, source)
  database.close()
  const reopened = createDatabase(database.name)
  expect(await getVisibility(reopened)).toEqual(sourceVisibility)
  const legacy = { ...source, metadata: source.metadata.filter(row => row.id !== VISIBILITY_SETTING_ID) }
  expect(readFullBackup(legacy)).toEqual(legacy)
  await restoreFullBackup(legacy, reopened)
  expect(await reopened.metadata.get(VISIBILITY_SETTING_ID)).toBeUndefined()
  expect(await getVisibility(reopened)).toEqual(DEFAULT_VISIBILITY)
  expect(await reopened.metadata.get(VISIBILITY_SETTING_ID)).toBeUndefined()
  await expectSnapshot(reopened, legacy)
})

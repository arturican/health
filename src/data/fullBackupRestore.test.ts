import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { exportFullBackup, restoreFullBackup } from './fullBackupRepository'
import { prepareFullBackup } from '../media/fullBackupFile'
import { encodeBase64 } from '../domain/base64'
import type { FullBackup } from '../domain/fullBackup'
import { expectDiaryUserDataEmpty } from '../../tests/generationAssertions'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 2, 0, 1, 1, 1, 17, 0, 255, 217])
function fixture(variant: number): FullBackup {
  const offset = variant * 1000
  const productId = id(offset + 201)
  const documentId = id(offset + 601)
  const photoFileId = id(offset + 701)
  const documentFileId = id(offset + 702)
  const kg = variant === 1 ? 70 : 80
  const heightCm = variant === 1 ? 170 : 180
  const pdf = new Uint8Array(new TextEncoder().encode(`%PDF-1.7\nSynthetic source ${String(variant)}\n%%EOF\n`))
  return {
    format: 'health-diary-full', version: 1,
    text: {
      format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
      profile: { id: 'self', name: `Синтетический профиль ${String(variant)}`, heightCm, birthDate: null, formulaSex: 'none' },
      weights: [{ id: id(offset + 101), date: '2026-10-12', kg }],
      products: [{ id: productId, name: `Синтетический архив ${String(variant)}`, source: '', kcal: 0, protein: 0, fat: null, carbs: 0, archived: true }],
      foodEntries: [{ id: id(offset + 301), productId, date: '2026-10-14', meal: 'lunch', grams: 125, note: '', snapshot: { name: 'Прежнее синтетическое название', source: 'Прежняя этикетка', kcal: 100, protein: 0, fat: null, carbs: 10 } }],
      nutritionDays: [{ date: '2026-10-14', complete: variant === 1 }], steps: [{ date: '2026-10-14', count: variant === 1 ? 100 : 0 }],
      workouts: [{ id: id(offset + 401), date: '2026-10-14', kind: `Синтетическая прогулка ${String(variant)}`, minutes: 30, kcal: variant === 1 ? 0 : null, source: '', note: '' }],
      energyPlans: [{ id: id(offset + 402), revision: variant, createdOn: '2026-10-14', effectiveFrom: '2026-10-15', goalKcal: variant === 1 ? 2000 : 0, method: 'manual', manualKcal: variant === 1 ? 2200 : 0, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg, weightDate: '2026-10-12', heightCm, age: null, formulaSex: 'none' } }],
    },
    metadata: [{ id: 'catalog-seeded', value: 'done' }, { id: 'fixture', value: `Синтетическая настройка ${String(variant)}` }],
    photos: [{ id: id(offset + 501), fileId: photoFileId, date: '2026-10-12', title: `Синтетическое фото ${String(variant)}`, note: '', width: 1, height: 2 }],
    documents: [{ id: documentId, fileId: documentFileId, date: '2026-10-14', title: `Синтетический бланк ${String(variant)}`, kind: variant === 1 ? 'report' : 'lab', note: '' }],
    labResults: [{ id: id(offset + 801), documentId, date: '2026-10-14', name: 'Синтетический показатель', value: variant === 1 ? { type: 'number', number: -1.25, operator: 'lte' } : { type: 'text', text: 'Синтетический текст' }, unit: '', reference: 'Буквальный референс', note: '' }],
    files: [
      { id: photoFileId, purpose: 'photo', mime: 'image/jpeg', size: jpeg.length, base64: encodeBase64(jpeg) },
      { id: documentFileId, purpose: 'document', mime: 'application/pdf', size: pdf.length, base64: encodeBase64(pdf) },
    ],
  }
}
const original = fixture(1)
const replacement = fixture(2)
const empty: FullBackup = { format: 'health-diary-full', version: 1, text: { ...original.text, profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] }, metadata: [], photos: [], documents: [], labResults: [], files: [] }
const connections: DiaryDatabase[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-full-restore-${String(++sequence)}`)
  connections.push(database)
  return database
}
async function populate(database: DiaryDatabase, input = original) {
  const { backup, files } = await prepareFullBackup(input)
  await database.metadata.bulkAdd(backup.metadata)
  if (backup.text.profile) await database.profiles.add(backup.text.profile)
  await database.weights.bulkAdd(backup.text.weights)
  await database.products.bulkAdd(backup.text.products)
  await database.foodEntries.bulkAdd(backup.text.foodEntries)
  await database.nutritionDays.bulkAdd(backup.text.nutritionDays)
  await database.steps.bulkAdd(backup.text.steps)
  await database.workouts.bulkAdd(backup.text.workouts)
  await database.energyPlans.bulkAdd(backup.text.energyPlans)
  await database.files.bulkAdd(files)
  await database.photos.bulkAdd(backup.photos)
  await database.documents.bulkAdd(backup.documents)
  await database.labResults.bulkAdd(backup.labResults)
}

beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob)
  vi.stubGlobal('createImageBitmap', vi.fn<typeof createImageBitmap>().mockImplementation(() => {
    expect(Dexie.currentTransaction).toBeNull()
    return Promise.resolve({ width: 1, height: 2, close: vi.fn() })
  }))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(original.text.exportedAt))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('заменяет все 13 непустых таблиц одной физической RW-транзакцией и сохраняет точные IDs/байты после reopen', async () => {
  const database = createDatabase()
  await populate(database)
  expect((await Promise.all(database.tables.map(table => table.count()))).every(count => count > 0)).toBe(true)
  const transactions = new Set<IDBTransaction>()
  const created = new Set<string>()
  const unsubscribe: (() => void)[] = []
  for (const name of database.tables.map(table => table.name)) {
    const table = database.table<unknown, string>(name)
    function observe() {
      expect(Dexie.currentTransaction.mode).toBe('readwrite')
      transactions.add(Dexie.currentTransaction.idbtrans)
      created.add(name)
    }
    table.hook('creating', observe)
    unsubscribe.push(() => { table.hook('creating').unsubscribe(observe) })
  }
  await restoreFullBackup(replacement, database)
  unsubscribe.forEach(remove => { remove() })
  expect(transactions.size).toBe(1)
  expect(created.size).toBe(13)
  expect([...created].sort()).toEqual(database.tables.map(table => table.name).sort())
  database.close()
  const reopened = new DiaryDatabase(database.name)
  connections.push(reopened)
  expect(await exportFullBackup(reopened)).toEqual(replacement)
  expect(await reopened.metadata.get('fixture')).toEqual(replacement.metadata[1])
  expect((await reopened.products.toArray())[0]?.archived).toBe(true)
  expect((await reopened.foodEntries.toArray())[0]?.snapshot.name).toBe('Прежнее синтетическое название')
})

it('пустая полная копия очищает все таблицы, включая настройки, media и показатели', async () => {
  const database = createDatabase()
  await populate(database)
  await restoreFullBackup(empty, database)
  await expectDiaryUserDataEmpty(database)
  expect(await exportFullBackup(database)).toEqual(empty)
})

it('повторно проверяет изменённый preview, unknown-схему, связи и MIME/EXIF до RW', async () => {
  const database = createDatabase()
  await populate(database)
  const preview = (await prepareFullBackup(replacement)).backup
  const previewFile = preview.files[0]
  if (!previewFile) throw new Error('Синтетический файл предпросмотра отсутствует')
  previewFile.base64 = 'invalid-after-preview'
  const exif = new Uint8Array([...jpeg.slice(0, 2), 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, ...jpeg.slice(2)])
  const transaction = vi.spyOn(database, 'transaction')
  for (const input of [
    null, { ...replacement, version: 2 }, preview,
    { ...replacement, files: replacement.files.slice(0, 1) },
    { ...replacement, files: replacement.files.map(file => file.purpose === 'document' ? { ...file, size: jpeg.length, base64: encodeBase64(jpeg) } : file) },
    { ...replacement, files: replacement.files.map(file => file.purpose === 'photo' ? { ...file, size: exif.length, base64: encodeBase64(exif) } : file) },
  ]) await expect(restoreFullBackup(input, database)).rejects.toThrow()
  expect(transaction).not.toHaveBeenCalled()
  transaction.mockRestore()
  expect(await exportFullBackup(database)).toEqual(original)
})

it('поздний отказ labResults.bulkAdd откатывает уже заменённые данные всех 13 таблиц и оригинальные файлы', async () => {
  const database = createDatabase()
  await populate(database)
  const failure = vi.spyOn(database.labResults, 'bulkAdd').mockImplementationOnce(() => Dexie.Promise.resolve().then(async () => {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    expect(await database.metadata.toArray()).toEqual(replacement.metadata)
    expect(await database.profiles.toArray()).toEqual([replacement.text.profile])
    expect(await database.weights.toArray()).toEqual(replacement.text.weights)
    expect(await database.products.toArray()).toEqual(replacement.text.products)
    expect(await database.foodEntries.toArray()).toEqual(replacement.text.foodEntries)
    expect(await database.nutritionDays.toArray()).toEqual(replacement.text.nutritionDays)
    expect(await database.steps.toArray()).toEqual(replacement.text.steps)
    expect(await database.workouts.toArray()).toEqual(replacement.text.workouts)
    expect(await database.energyPlans.toArray()).toEqual(replacement.text.energyPlans)
    expect(await database.photos.toArray()).toEqual(replacement.photos)
    expect(await database.documents.toArray()).toEqual(replacement.documents)
    expect((await database.files.toArray()).map(file => file.id)).toEqual(replacement.files.map(file => file.id))
    expect(await database.labResults.count()).toBe(0)
    throw new DOMException('Синтетический поздний отказ записи', 'QuotaExceededError')
  }))
  await expect(restoreFullBackup(replacement, database)).rejects.toMatchObject({ name: 'QuotaExceededError' })
  failure.mockRestore()
  expect(await exportFullBackup(database)).toEqual(original)
})

it('восстанавливает через повторно открытый default singleton только тестовую базу', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  await populate(db)
  await restoreFullBackup(replacement)
  expect(await exportFullBackup()).toEqual(replacement)
})

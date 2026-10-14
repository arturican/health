import Dexie from 'dexie'
import { afterEach, expect, test } from 'vitest'
import { DiaryDatabase } from './db'
import { getFile, prepareFile, savePreparedFile } from './fileRepository'
import type { StoredFile } from '../domain/storedFile'
import type { EnergyPlan } from '../domain/energyPlan'

const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 83, 89, 255, 217])
const connections: Dexie[] = []
function createDatabase(name = `health-diary-test-files-browser-${crypto.randomUUID()}`) {
  expect(import.meta.env.MODE).toBe('test')
  expect(name.startsWith('health-diary-test-files-browser-')).toBe(true)
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function expectStoredFile(original: StoredFile, database: DiaryDatabase) {
  const stored = await getFile(original.id, database)
  if (!stored) throw new Error('Синтетическое вложение должно сохраниться')
  expect({ ...stored, blob: null }).toEqual({ ...original, blob: null })
  expect(stored.blob).toBeInstanceOf(Blob)
  expect(stored.blob.type).toBe('image/jpeg')
  expect(new Uint8Array(await stored.blob.arrayBuffer())).toEqual(jpeg)
}

test('настоящий IndexedDB сохраняет канонический Blob и его байты после закрытия и повторного открытия', async () => {
  const database = createDatabase()
  const original = await prepareFile(new File([jpeg], 'synthetic-misleading.txt', { type: '' }), 'photo')
  expect(original.mime).toBe('image/jpeg')
  expect(original.blob.type).toBe('image/jpeg')
  expect(original.size).toBe(jpeg.length)
  await savePreparedFile(original, database)
  await expectStoredFile(original, database)
  database.close()
  const reopened = createDatabase(database.name)
  await expectStoredFile(original, reopened)
  expect(await reopened.files.count()).toBe(1)
})

test('общая транзакция откатывает файл и связь, чтение отклоняет неверные ID, метаданные и содержимое', async () => {
  const database = createDatabase()
  const original = await prepareFile(new Blob([jpeg], { type: 'image/jpeg' }), 'document')
  await expect(database.transaction('rw', database.metadata, database.files, async () => {
    await database.metadata.add({ id: 'synthetic-file-link', value: original.id })
    await savePreparedFile(original, database)
    throw new Error('Синтетический поздний отказ')
  })).rejects.toThrow('Синтетический поздний отказ')
  expect(await database.files.count()).toBe(0)
  expect(await database.metadata.count()).toBe(0)
  await expect(getFile('не UUID', database)).rejects.toThrow()
  await expect(getFile(null, database)).rejects.toThrow()
  expect(await getFile('00000000-0000-4000-8000-000000000099', database)).toBeNull()
  await savePreparedFile(original, database)
  await expect(savePreparedFile(original, database)).rejects.toThrow()
  expect(await database.files.count()).toBe(1)
  await expectStoredFile(original, database)
  await database.table<unknown, string>('files').put({ ...original, size: original.size + 1 })
  await expect(getFile(original.id, database)).rejects.toThrow('Метаданные вложения не совпадают с файлом')
  const invalidBytes = new Blob(['<html>synthetic</html>'], { type: 'image/jpeg' })
  await database.table<unknown, string>('files').put({ ...original, blob: invalidBytes, size: invalidBytes.size })
  await expect(getFile(original.id, database)).rejects.toThrow('Неподдерживаемый формат вложения')
  expect(await database.files.count()).toBe(1)
  expect(await database.metadata.count()).toBe(0)
})

test('миграция браузерной базы v8 в v9 сохраняет все прежние таблицы и добавляет индексируемые файлы', async () => {
  const database = createDatabase()
  const previous = new Dexie(database.name)
  connections.push(previous)
  previous.version(8).stores({
    metadata: 'id', profiles: 'id', weights: 'id,&date', products: 'id,name', foodEntries: 'id,date,[date+meal]',
    nutritionDays: 'date', steps: 'date', workouts: 'id,date', energyPlans: 'id,effectiveFrom,&revision',
  })
  const plan: EnergyPlan = {
    id: '00000000-0000-4000-8000-000000000005', revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-20',
    goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: 'Синтетическая оценка', restingFormula: 'mifflin-st-jeor-1990',
    snapshot: { kg: 70, weightDate: '2026-10-13', heightCm: 170, age: 30, formulaSex: 'male' },
  }
  const product = { id: '00000000-0000-4000-8000-000000000002', name: 'Синтетический архивный продукт', source: '', kcal: 200, protein: null, fat: 0, carbs: 10, archived: true }
  const records: [string, unknown][] = [
    ['metadata', { id: 'synthetic-metadata', value: 'Синтетическая служебная запись' }],
    ['profiles', { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: '1996-10-14', formulaSex: 'male' }],
    ['weights', { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-13', kg: 70 }],
    ['products', product],
    ['foodEntries', {
      id: '00000000-0000-4000-8000-000000000003', date: '2026-10-13', meal: 'lunch', productId: product.id, grams: 150, note: '',
      snapshot: { name: 'Исторический синтетический продукт', source: 'Синтетическая этикетка', kcal: 100, protein: null, fat: 0, carbs: 10 },
    }],
    ['nutritionDays', { date: '2026-10-13', complete: false }], ['steps', { date: '2026-10-13', count: 0 }],
    ['workouts', { id: '00000000-0000-4000-8000-000000000004', date: '2026-10-13', kind: 'Синтетическая тренировка', minutes: 30.5, kcal: 0, source: '', note: '' }],
    ['energyPlans', plan],
  ]
  for (const [name, record] of records) await previous.table<unknown, string>(name).add(record)
  previous.close()
  expect(await database.files.count()).toBe(0)
  for (const [name, record] of records) expect(await database.table<unknown, string>(name).toArray()).toEqual([record])
  const file = await prepareFile(new Blob([jpeg], { type: '' }), 'document')
  await savePreparedFile(file, database)
  expect((await database.files.where('purpose').equals('document').toArray()).map(record => record.id)).toEqual([file.id])
  await expectStoredFile(file, database)
  for (const [name, record] of records) expect(await database.table<unknown, string>(name).toArray()).toEqual([record])
})

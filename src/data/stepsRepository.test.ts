import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { deleteSteps, getSteps, saveSteps } from './stepsRepository'
import type { Profile, Weight } from '../domain/profile'
import type { FoodEntry, Product } from '../domain/nutrition'

const today = '2026-10-14'
const connections: Dexie[] = []
let sequence = 0
function createDatabase(name = `health-diary-test-steps-${String(++sequence)}`) {
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
})
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
})

it('отличает отсутствие от нуля и обновляет одну запись даты независимо от остальных дней', async () => {
  const database = createDatabase()
  expect(await getSteps(today, database)).toBeNull()
  await saveSteps({ date: today, count: 0 }, database)
  expect(await getSteps(today, database)).toEqual({ date: today, count: 0 })
  await saveSteps({ date: today, count: 7500 }, database)
  await saveSteps({ date: '2026-10-13', count: 1000000 }, database)
  expect(await getSteps(today, database)).toEqual({ date: today, count: 7500 })
  expect(await getSteps('2026-10-13', database)).toEqual({ date: '2026-10-13', count: 1000000 })
  expect(await getSteps('2026-10-12', database)).toBeNull()
  expect(await database.steps.count()).toBe(2)
})

it('отклоняет неверные даты, будущий ввод и неизвестные поля без изменения сохранённых шагов', async () => {
  const database = createDatabase()
  await saveSteps({ date: today, count: 0 }, database)
  for (const date of [null, '', '2026-02-29', '0000-01-01', 20261014, {}]) {
    await expect(getSteps(date, database)).rejects.toThrow()
    await expect(deleteSteps(date, database)).rejects.toThrow()
  }
  for (const input of [null, { date: today, count: 1.5 }, { date: today, count: '0' }, { date: today, count: 0, extra: true }]) {
    await expect(saveSteps(input, database)).rejects.toThrow()
  }
  await expect(saveSteps({ date: '2026-10-15', count: 100 }, database)).rejects.toThrow(/в будущем/)
  expect(await getSteps(today, database)).toEqual({ date: today, count: 0 })
  expect(await database.steps.count()).toBe(1)
})

it('проверяет повреждённые данные при чтении вместо преобразования в ноль', async () => {
  const database = createDatabase()
  for (const corrupted of [{ date: today, count: '0' }, { date: today, count: NaN }, { date: today, count: 0, kcal: 100 }]) {
    await database.table<unknown, string>('steps').put(corrupted)
    await expect(getSteps(today, database)).rejects.toThrow()
  }
})

it('оставляет прежние данные при отказах создания, обновления и удаления', async () => {
  const database = createDatabase()
  const creating = () => { throw new Error('Синтетический отказ создания') }
  database.steps.hook('creating', creating)
  await expect(saveSteps({ date: today, count: 0 }, database)).rejects.toThrow('Синтетический отказ создания')
  expect(await getSteps(today, database)).toBeNull()
  database.steps.hook('creating').unsubscribe(creating)
  await saveSteps({ date: today, count: 100 }, database)
  database.steps.hook('updating', () => { throw new Error('Синтетический отказ правки') })
  await expect(saveSteps({ date: today, count: 200 }, database)).rejects.toThrow('Синтетический отказ правки')
  database.steps.hook('deleting', () => { throw new Error('Синтетический отказ удаления') })
  await expect(deleteSteps(today, database)).rejects.toThrow('Синтетический отказ удаления')
  expect(await getSteps(today, database)).toEqual({ date: today, count: 100 })
  expect(await database.steps.count()).toBe(1)
})

it('удаляет день идемпотентно, сохраняя соседний день после повторного открытия', async () => {
  const database = createDatabase()
  await saveSteps({ date: today, count: 0 }, database)
  await saveSteps({ date: '2026-10-13', count: 6000 }, database)
  await deleteSteps(today, database)
  await deleteSteps(today, database)
  expect(await getSteps(today, database)).toBeNull()
  expect(await database.steps.count()).toBe(1)
  database.close()
  const reopened = createDatabase(database.name)
  expect(await getSteps(today, reopened)).toBeNull()
  expect(await getSteps('2026-10-13', reopened)).toEqual({ date: '2026-10-13', count: 6000 })
})

it('мигрирует v5 в v6 без потери всех прежних таблиц и служебных данных', async () => {
  const original = new Dexie(`health-diary-test-steps-migration-${String(++sequence)}`)
  connections.push(original)
  original.version(1).stores({ metadata: 'id' })
  original.version(2).stores({ profiles: 'id', weights: 'id,&date' })
  original.version(3).stores({ products: 'id,name' })
  original.version(4).stores({ foodEntries: 'id,date,[date+meal]' })
  original.version(5).stores({ nutritionDays: 'date' })
  const profile: Profile = { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: null, formulaSex: 'none' }
  const weight: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-13', kg: 70 }
  const product: Product = { id: '00000000-0000-4000-8000-000000000002', name: 'Синтетический архив', source: '', kcal: 100, protein: null, fat: 0, carbs: 10, archived: true }
  const food: FoodEntry = {
    id: '00000000-0000-4000-8000-000000000003', date: weight.date, meal: 'breakfast', productId: product.id, grams: 150, note: '',
    snapshot: { name: 'Прежний синтетический продукт', source: 'Синтетическая этикетка', kcal: 150, protein: null, fat: 0, carbs: 10 },
  }
  const nutritionDay = { date: weight.date, complete: false }
  const metadata = { id: 'fixture', value: 'Синтетическая служебная запись' }
  await original.table('profiles').add(profile)
  await original.table('weights').add(weight)
  await original.table('products').add(product)
  await original.table('foodEntries').add(food)
  await original.table('nutritionDays').add(nutritionDay)
  await original.table('metadata').add(metadata)
  original.close()
  const migrated = createDatabase(original.name)
  expect(await getSteps(today, migrated)).toBeNull()
  await saveSteps({ date: today, count: 0 }, migrated)
  expect(await migrated.profiles.get('self')).toEqual(profile)
  expect(await migrated.weights.get(weight.id)).toEqual(weight)
  expect(await migrated.products.get(product.id)).toEqual(product)
  expect(await migrated.foodEntries.get(food.id)).toEqual(food)
  expect(await migrated.nutritionDays.get(weight.date)).toEqual(nutritionDay)
  expect(await migrated.metadata.get(metadata.id)).toEqual(metadata)
  expect(await getSteps(today, migrated)).toEqual({ date: today, count: 0 })
})

it('использует тестовую базу и текущую местную дату по умолчанию для чтения', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  expect(await getSteps()).toBeNull()
  await saveSteps({ date: today, count: 0 })
  await saveSteps({ date: '2026-10-13', count: 6000 })
  expect(await getSteps()).toEqual({ date: today, count: 0 })
  await deleteSteps(today)
  expect(await getSteps()).toBeNull()
  expect(await getSteps('2026-10-13')).toEqual({ date: '2026-10-13', count: 6000 })
})

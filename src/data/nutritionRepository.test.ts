import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { getNutritionDay, setNutritionDay } from './nutritionRepository'
import { listFood } from './foodRepository'
import type { FoodEntry, Product } from '../domain/nutrition'

const today = '2026-10-14'
const product: Product = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт', source: 'Синтетическая этикетка',
  kcal: 250, protein: 12, fat: null, carbs: 0, archived: false,
}
const food: FoodEntry = {
  id: '00000000-0000-4000-8000-000000000002', date: today, meal: 'lunch', productId: product.id,
  snapshot: { name: product.name, source: product.source, kcal: 250, protein: 12, fat: null, carbs: 0 },
  grams: 150, note: 'Синтетическая запись еды',
}
const connections: Dexie[] = []
let sequence = 0
function createDatabase(name = `health-diary-test-nutrition-${String(++sequence)}`) {
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

it('отличает отсутствие отметки от явной полноты и её отмены, не смешивая даты', async () => {
  const database = createDatabase()
  expect(await getNutritionDay(today, database)).toBeNull()
  await setNutritionDay(today, true, database)
  await setNutritionDay('2026-10-13', true, database)
  await setNutritionDay(today, false, database)
  expect(await getNutritionDay(today, database)).toEqual({ date: today, complete: false })
  expect(await getNutritionDay('2026-10-13', database)).toEqual({ date: '2026-10-13', complete: true })
  expect(await getNutritionDay('2026-10-12', database)).toBeNull()
  expect(await database.nutritionDays.count()).toBe(2)
  await setNutritionDay(today, true, database)
  expect(await getNutritionDay(today, database)).toEqual({ date: today, complete: true })
  expect(await database.nutritionDays.count()).toBe(2)
})

it('отклоняет неверную дату, будущий день, нестрогий флаг и повреждённые поля', async () => {
  const database = createDatabase()
  await setNutritionDay(today, true, database)
  for (const date of ['', '2026-02-29', '0000-01-01']) {
    await expect(getNutritionDay(date, database)).rejects.toThrow()
    await expect(setNutritionDay(date, false, database)).rejects.toThrow()
  }
  await expect(setNutritionDay('2026-10-15', true, database)).rejects.toThrow(/в будущем/)
  await expect(setNutritionDay(null, true, database)).rejects.toThrow()
  for (const complete of [null, undefined, 'true', 0, 1, {}]) {
    await expect(setNutritionDay(today, complete, database)).rejects.toThrow()
  }
  expect(await getNutritionDay(today, database)).toEqual({ date: today, complete: true })
  expect(await database.nutritionDays.count()).toBe(1)
  await database.table<unknown, string>('nutritionDays').put({ date: today, complete: 'true' })
  await expect(getNutritionDay(today, database)).rejects.toThrow()
  await database.table<unknown, string>('nutritionDays').put({ date: today, complete: true, extra: 'Синтетическое поле' })
  await expect(getNutritionDay(today, database)).rejects.toThrow('Неизвестные поля записи')
})

it('не создаёт отметку при отказе записи и сохраняет прежнюю полноту при отказе правки', async () => {
  const database = createDatabase()
  const failCreating = () => { throw new Error('Синтетический отказ создания') }
  database.nutritionDays.hook('creating', failCreating)
  await expect(setNutritionDay(today, true, database)).rejects.toThrow('Синтетический отказ создания')
  expect(await getNutritionDay(today, database)).toBeNull()
  database.nutritionDays.hook('creating').unsubscribe(failCreating)
  await setNutritionDay(today, true, database)
  database.nutritionDays.hook('updating', () => { throw new Error('Синтетический отказ правки') })
  await expect(setNutritionDay(today, false, database)).rejects.toThrow('Синтетический отказ правки')
  expect(await getNutritionDay(today, database)).toEqual({ date: today, complete: true })
  expect(await database.nutritionDays.count()).toBe(1)
})

it('сохраняет полные и явно неполные дни после закрытия и повторного открытия базы', async () => {
  const database = createDatabase()
  await setNutritionDay(today, true, database)
  await setNutritionDay('2026-10-13', false, database)
  database.close()
  const reopened = createDatabase(database.name)
  expect(await getNutritionDay(today, reopened)).toEqual({ date: today, complete: true })
  expect(await getNutritionDay('2026-10-13', reopened)).toEqual({ date: '2026-10-13', complete: false })
  expect(await getNutritionDay('2026-10-12', reopened)).toBeNull()
})

it('мигрирует v4 без потери продуктов и снимков еды, добавляя отдельную отметку полноты', async () => {
  const original = new Dexie(`health-diary-test-nutrition-migration-${String(++sequence)}`)
  connections.push(original)
  original.version(1).stores({ metadata: 'id' })
  original.version(2).stores({ profiles: 'id', weights: 'id,&date' })
  original.version(3).stores({ products: 'id,name' })
  original.version(4).stores({ foodEntries: 'id,date,[date+meal]' })
  await original.table('products').add(product)
  await original.table('foodEntries').add(food)
  original.close()
  const migrated = createDatabase(original.name)
  expect(await getNutritionDay(today, migrated)).toBeNull()
  await setNutritionDay(today, true, migrated)
  expect(await migrated.products.get(product.id)).toEqual(product)
  expect(await listFood(today, migrated)).toEqual([food])
  expect(await getNutritionDay(today, migrated)).toEqual({ date: today, complete: true })
})

it('использует тестовый singleton и местную текущую дату для чтения по умолчанию', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  expect(await getNutritionDay()).toBeNull()
  await setNutritionDay(today, true)
  await setNutritionDay('2026-10-13', false)
  expect(await getNutritionDay()).toEqual({ date: today, complete: true })
  expect(await getNutritionDay('2026-10-13')).toEqual({ date: '2026-10-13', complete: false })
})

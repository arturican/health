import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addFood, listFood } from './foodRepository'
import { addProduct, archiveProduct, updateProduct } from './productRepository'
import { portion, type Product } from '../domain/nutrition'

const product: Product = { id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт', source: 'Тест', kcal: 250, protein: 12, fat: null, carbs: 0, archived: false }
const input = { date: '2026-10-14', meal: 'lunch', productId: product.id, grams: 150, note: '  Тестовая запись  ' }
const connections: Dexie[] = []
let sequence = 0
function createDatabase(name = `health-diary-test-food-${String(++sequence)}`) {
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

it('сохраняет снимок и порцию независимо от последующих правок и архива продукта', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  const entry = await addFood(input, database)
  expect(entry).toMatchObject({ date: input.date, meal: 'lunch', grams: 150, note: 'Тестовая запись', snapshot: { name: product.name, kcal: 250, protein: 12, fat: null, carbs: 0 } })
  expect(portion(entry.snapshot, entry.grams)).toEqual({ kcal: 375, protein: 18, fat: null, carbs: 0 })
  await updateProduct(product.id, { name: 'Правка', source: '', kcal: 100, protein: 0, fat: 0, carbs: 0 }, database)
  await archiveProduct(product.id, true, database)
  expect(await listFood(input.date, database)).toEqual([entry])
  database.close()
  expect(await listFood(input.date, createDatabase(database.name))).toEqual([entry])
})

it('группирует приёмы в порядке дня и не смешивает календарные даты', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  await addFood({ ...input, meal: 'dinner' }, database)
  await addFood({ ...input, meal: 'breakfast' }, database)
  await addFood({ ...input, meal: 'snack', date: '2026-10-13' }, database)
  expect((await listFood(input.date, database)).map(entry => entry.meal)).toEqual(['breakfast', 'dinner'])
  expect(await listFood('2026-10-12', database)).toEqual([])
  await expect(listFood('2026-02-29', database)).rejects.toThrow()
})

it('отклоняет отсутствующий и архивный продукт, неверный ввод и будущую дату', async () => {
  const database = createDatabase()
  await expect(addFood(input, database)).rejects.toThrow('Продукт не найден')
  await addProduct({ ...product, archived: true }, database)
  await expect(addFood(input, database)).rejects.toThrow(/Продукт в архиве/)
  for (const value of [{ ...input, grams: 0 }, { ...input, productId: null }, { ...input, meal: 'other' }, { ...input, extra: true }, { ...input, date: '2026-10-15' }]) {
    await expect(addFood(value, database)).rejects.toThrow()
  }
  expect(await database.foodEntries.count()).toBe(0)
})

it('не создаёт запись при отказе хранилища и отклоняет повреждённый снимок на чтении', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  const fail = () => { throw new Error('Синтетический отказ') }
  database.foodEntries.hook('creating', fail)
  await expect(addFood(input, database)).rejects.toThrow('Синтетический отказ')
  expect(await database.foodEntries.count()).toBe(0)
  expect(await database.products.get(product.id)).toEqual(product)
  database.foodEntries.hook('creating').unsubscribe(fail)
  const entry = await addFood(input, database)
  await database.table<unknown, string>('foodEntries').put({ ...entry, snapshot: { ...entry.snapshot, kcal: '250' } })
  await expect(listFood(input.date, database)).rejects.toThrow()
})

it('добавляет таблицу v4 без потери каталога v3', async () => {
  const original = new Dexie(`health-diary-test-food-migration-${String(++sequence)}`)
  connections.push(original)
  original.version(1).stores({ metadata: 'id' })
  original.version(2).stores({ profiles: 'id', weights: 'id,&date' })
  original.version(3).stores({ products: 'id,name' })
  await original.table('products').add(product)
  original.close()
  const migrated = createDatabase(original.name)
  const entry = await addFood(input, migrated)
  expect(await migrated.products.get(product.id)).toEqual(product)
  expect(await listFood(input.date, migrated)).toEqual([entry])
})

it('работает с тестовым singleton и текущей датой по умолчанию', async () => {
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await addProduct(product)
  const entry = await addFood(input)
  expect(await listFood()).toEqual([entry])
})

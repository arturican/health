import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addFood, copyMeal, deleteFood, listFood, updateFood } from './foodRepository'
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
  await updateFood(entry.id, { date: input.date, meal: 'dinner', grams: 200, note: 'Правка' })
  expect(await listFood()).toEqual([{ ...entry, meal: 'dinner', grams: 200, note: 'Правка' }])
  await deleteFood(entry.id)
  await deleteFood(entry.id)
  expect(await listFood()).toEqual([])
})

it('правит архивную запись без замены снимка и не принимает скрытую правку продукта', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  const entry = await addFood(input, database)
  await archiveProduct(product.id, true, database)
  const changes = { date: '2026-10-13', meal: 'dinner', grams: 200, note: '  Правка  ' }
  await updateFood(entry.id, changes, database)
  expect(await listFood('2026-10-13', database)).toEqual([{ ...entry, ...changes, note: 'Правка' }])
  await expect(updateFood(entry.id, { ...changes, productId: product.id }, database)).rejects.toThrow('Неизвестные поля записи')
  await expect(updateFood(entry.id, { ...changes, date: '2026-10-15' }, database)).rejects.toThrow(/в будущем/)
  await expect(updateFood('00000000-0000-4000-8000-000000000003', changes, database)).rejects.toThrow('Запись еды не найдена')
  await expect(deleteFood('bad', database)).rejects.toThrow(/идентификатор/)
  database.foodEntries.hook('updating', () => { throw new Error('Синтетический отказ правки') })
  await expect(updateFood(entry.id, { ...changes, grams: 300 }, database)).rejects.toThrow('Синтетический отказ правки')
  expect(await listFood('2026-10-13', database)).toEqual([{ ...entry, ...changes, note: 'Правка' }])
  await deleteFood(entry.id, database)
  expect(await database.products.count()).toBe(1)
  expect(await database.foodEntries.count()).toBe(0)
})

it('копирует только выбранный приём с новыми ID и старыми снимками, сохраняя прочие записи и полноту дней', async () => {
  const database = createDatabase()
  const target = '2026-10-13'
  await addProduct(product, database)
  await addFood({ ...input, note: 'Первая синтетическая порция' }, database)
  await addFood({ ...input, grams: 75, note: 'Вторая синтетическая порция' }, database)
  await addFood({ ...input, meal: 'breakfast' }, database)
  await addFood({ ...input, date: '2026-10-12' }, database)
  const existingTarget = await addFood({ ...input, date: target, note: 'Прежняя целевая запись' }, database)
  await database.nutritionDays.bulkPut([{ date: input.date, complete: false }, { date: target, complete: true }])
  await updateProduct(product.id, { name: 'Синтетическая правка каталога', source: '', kcal: 100, protein: 0, fat: 0, carbs: 0 }, database)
  await archiveProduct(product.id, true, database)
  const original = await listFood(input.date, database)
  const selected = original.filter(entry => entry.meal === 'lunch')
  const before = await database.foodEntries.toArray()
  const completeness = await database.nutritionDays.toArray()

  expect(await copyMeal(input.date, 'lunch', target, database)).toBe(2)
  expect(await listFood(input.date, database)).toEqual(original)
  const targetEntries = await listFood(target, database)
  expect(targetEntries).toContainEqual(existingTarget)
  const copies = targetEntries.filter(entry => entry.id !== existingTarget.id)
  expect(copies).toHaveLength(2)
  expect(copies.map(entry => ({ ...entry, id: '' }))).toEqual(expect.arrayContaining(selected.map(entry => ({ ...entry, id: '', date: target }))))
  expect(new Set(copies.map(entry => entry.id)).size).toBe(2)
  for (const copy of copies) {
    expect(copy.id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
    expect(before.map(entry => entry.id)).not.toContain(copy.id)
  }
  expect(await database.foodEntries.toArray()).toEqual(expect.arrayContaining(before))
  expect(await database.foodEntries.count()).toBe(before.length + 2)
  expect(await database.nutritionDays.toArray()).toEqual(completeness)
})

it('отклоняет тот же день, будущие и неверные параметры, пустой приём и повреждённые источники без копий', async () => {
  const database = createDatabase()
  const target = '2026-10-13'
  await addProduct(product, database)
  const entry = await addFood(input, database)
  const before = await database.foodEntries.toArray()
  const invalid: [unknown, unknown, unknown][] = [
    [input.date, 'lunch', input.date], ['2026-10-15', 'lunch', target], [input.date, 'lunch', '2026-10-15'],
    [null, 'lunch', target], [input.date, 'other', target], [input.date, 'lunch', '2026-02-29'], [input.date, 'lunch', null],
  ]
  for (const [source, meal, date] of invalid) await expect(copyMeal(source, meal, date, database)).rejects.toThrow()
  await expect(copyMeal(input.date, 'breakfast', target, database)).rejects.toThrow('В выбранном приёме пищи нет записей')
  await expect(copyMeal('2026-10-12', 'lunch', target, database)).rejects.toThrow('В выбранном приёме пищи нет записей')
  expect(await database.foodEntries.toArray()).toEqual(before)
  const corrupted = { ...entry, snapshot: { ...entry.snapshot, kcal: '250' } }
  await database.table<unknown, string>('foodEntries').put(corrupted)
  await expect(copyMeal(input.date, 'lunch', target, database)).rejects.toThrow()
  expect(await database.table<unknown, string>('foodEntries').toArray()).toEqual([corrupted])
})

it('откатывает успешную часть bulkAdd при конфликте следующей копии, сохраняя источники и целевой день', async () => {
  const database = createDatabase()
  const target = '2026-10-13'
  await addProduct(product, database)
  const collisionId = '00000000-0000-4000-8000-000000000901'
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(collisionId)
  const source = await addFood(input, database)
  expect(source.id).toBe(collisionId)
  await addFood({ ...input, grams: 75 }, database)
  await addFood({ ...input, date: target }, database)
  await database.nutritionDays.put({ date: target, complete: true })
  const before = await database.foodEntries.toArray()
  uuid.mockReturnValueOnce('00000000-0000-4000-8000-000000000900').mockReturnValueOnce(collisionId)
  await expect(copyMeal(input.date, 'lunch', target, database)).rejects.toMatchObject({ name: 'BulkError' })
  uuid.mockRestore()
  expect(await database.foodEntries.toArray()).toEqual(before)
  expect(await database.nutritionDays.toArray()).toEqual([{ date: target, complete: true }])
})

it('копирует через тестовый singleton по умолчанию, не меняя исходную запись', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  await addProduct(product)
  const entry = await addFood(input)
  expect(await copyMeal(input.date, 'lunch', '2026-10-13')).toBe(1)
  expect(await listFood()).toEqual([entry])
  const copied = await listFood('2026-10-13')
  expect(copied.map(copy => ({ ...copy, id: '' }))).toEqual([{ ...entry, id: '', date: '2026-10-13' }])
  expect(copied[0]?.id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
  expect(copied[0]?.id).not.toBe(entry.id)
})

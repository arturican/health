import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addProduct, getProduct, listProducts, seedProducts } from './productRepository'
import type { Product } from '../domain/nutrition'

const product: Product = { id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт', source: '', kcal: 150, protein: null, fat: 0, carbs: 25, archived: false }
const connections: Dexie[] = []
let sequence = 0
function createDatabase(name = `health-diary-test-products-${String(++sequence)}`) {
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
})

it('сохраняет продукт, читает строго и сохраняет после повторного открытия', async () => {
  const database = createDatabase()
  expect(await listProducts(false, database)).toEqual([])
  expect(await getProduct(product.id, database)).toBeNull()
  await addProduct({ ...product, name: `  ${product.name}  ` }, database)
  expect(await getProduct(product.id, database)).toEqual(product)
  database.close()
  const reopened = createDatabase(database.name)
  expect(await listProducts(false, reopened)).toEqual([product])
  await expect(addProduct({ ...product, name: 'Дубликат' }, reopened)).rejects.toMatchObject({ name: 'ConstraintError' })
  expect(await getProduct(product.id, reopened)).toEqual(product)
})

it('сортирует каталог и фильтрует архив, сохраняя явно введённый ноль', async () => {
  const database = createDatabase()
  const archived = { ...product, id: '00000000-0000-4000-8000-000000000002', name: 'Архивный пример', archived: true }
  await database.products.bulkAdd([product, archived])
  expect(await listProducts(false, database)).toEqual([product])
  expect(await listProducts(true, database)).toEqual([archived, product])
  expect((await getProduct(product.id, database))?.fat).toBe(0)
})

it('не принимает неизвестные поля и повреждённые записи, включая скрытые архивные', async () => {
  const database = createDatabase()
  await expect(addProduct({ ...product, extra: true }, database)).rejects.toThrow('Неизвестные поля записи')
  await expect(getProduct('bad', database)).rejects.toThrow(/идентификатор/)
  expect(await database.products.count()).toBe(0)
  await database.table<unknown, string>('products').put({ ...product, archived: true, kcal: '150' })
  await expect(listProducts(false, database)).rejects.toThrow()
  await expect(getProduct(product.id, database)).rejects.toThrow()
})

it('добавляет примеры только по вызову, один раз и без перезаписи существующих ID', async () => {
  const database = createDatabase()
  await addProduct(product, database)
  const existing = { ...product, id: '00000000-0000-4000-8000-000000000101', name: 'Свой продукт с совпавшим ID' }
  await addProduct(existing, database)
  await seedProducts(database)
  await seedProducts(database)
  expect(await database.products.count()).toBe(3)
  expect(await getProduct(existing.id, database)).toEqual(existing)
  expect((await listProducts(false, database)).some(value => value.name.startsWith('Пример:'))).toBe(true)
  expect(await database.metadata.get('catalog-seeded')).toEqual({ id: 'catalog-seeded', value: 'done' })
})

it('откатывает и примеры, и маркер при ошибке записи', async () => {
  const database = createDatabase()
  database.metadata.hook('creating', () => { throw new Error('Синтетический отказ записи') })
  await expect(seedProducts(database)).rejects.toThrow('Синтетический отказ записи')
  expect(await database.products.count()).toBe(0)
  expect(await database.metadata.count()).toBe(0)
})

it('мигрирует v2 без потери профиля, веса и метаданных', async () => {
  const original = new Dexie(`health-diary-test-products-migration-${String(++sequence)}`)
  connections.push(original)
  original.version(1).stores({ metadata: 'id' })
  original.version(2).stores({ profiles: 'id', weights: 'id,&date' })
  const profile = { id: 'self', name: '', heightCm: 170, birthDate: null, formulaSex: 'none' }
  const weight = { id: product.id, date: '2026-10-14', kg: 70 }
  await original.table('profiles').add(profile)
  await original.table('weights').add(weight)
  await original.table('metadata').add({ id: 'fixture', value: 'Синтетическое значение' })
  original.close()
  const migrated = createDatabase(original.name)
  await addProduct(product, migrated)
  expect(await migrated.profiles.get('self')).toEqual(profile)
  expect(await migrated.weights.get(product.id)).toEqual(weight)
  expect(await migrated.metadata.get('fixture')).toMatchObject({ value: 'Синтетическое значение' })
  expect(await getProduct(product.id, migrated)).toEqual(product)
})

it('использует тестовую базу по умолчанию', async () => {
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await addProduct(product)
  expect(await getProduct(product.id)).toEqual(product)
  expect(await listProducts()).toEqual([product])
  await seedProducts()
  expect(await db.products.count()).toBe(3)
})

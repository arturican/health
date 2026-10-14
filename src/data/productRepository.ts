import { db, type DiaryDatabase } from './db'
import { readProduct, snapshotSchema, productSchema, type Product } from '../domain/nutrition'
import { entityId, validate } from '../domain/schema'

export async function listProducts(includeArchived = false, database: DiaryDatabase = db): Promise<Product[]> {
  const values: unknown[] = await database.products.toArray()
  return values.map(readProduct).filter(product => includeArchived || !product.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function getProduct(idInput: unknown, database: DiaryDatabase = db): Promise<Product | null> {
  const id = validate(entityId, idInput)
  const value: unknown = await database.products.get(id)
  return value === undefined ? null : readProduct(value)
}

export async function addProduct(input: unknown, database: DiaryDatabase = db): Promise<void> {
  await database.products.add(readProduct(input))
}

export async function updateProduct(idInput: unknown, input: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  const snapshot = validate(snapshotSchema, input)
  await database.transaction('rw', database.products, async () => {
    const existing = await getProduct(id, database)
    if (!existing) throw new Error('Продукт не найден')
    await database.products.put({ ...snapshot, id, archived: existing.archived })
  })
}

export async function archiveProduct(idInput: unknown, archivedInput: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  const archived = validate(productSchema.shape.archived, archivedInput)
  await database.transaction('rw', database.products, async () => {
    const existing = await getProduct(id, database)
    if (!existing) throw new Error('Продукт не найден')
    await database.products.put({ ...existing, archived })
  })
}

const examples: Product[] = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'Пример: продукт А', source: 'Учебные значения — замените данными этикетки', kcal: 250, protein: 12, fat: 10, carbs: 28, archived: false },
  { id: '00000000-0000-4000-8000-000000000102', name: 'Пример: продукт Б', source: 'Учебные значения — замените данными этикетки', kcal: 120, protein: null, fat: null, carbs: null, archived: false },
]

export async function seedProducts(database: DiaryDatabase = db): Promise<void> {
  await database.transaction('rw', database.products, database.metadata, async () => {
    if (await database.metadata.get('catalog-seeded')) return
    for (const product of examples) {
      if (!await database.products.get(product.id)) await database.products.add(readProduct(product))
    }
    await database.metadata.put({ id: 'catalog-seeded', value: 'done' })
  })
}

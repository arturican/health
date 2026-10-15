import { db, type DiaryDatabase } from './db'
import { readProduct, snapshotSchema, productSchema, type Product } from '../domain/nutrition'
import { entityId, validate } from '../domain/schema'
import { assertRecordCapacity, hasRecordCapacity } from './recordLimit'
import { DIARY_GENERATION_ID } from './clearDiary'
import { initialProducts } from '../domain/initialProducts'

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
  const product = readProduct(input)
  await database.transaction('rw', database.products, async () => {
    assertRecordCapacity(await database.products.count())
    await database.products.add(product)
  })
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

export async function seedProducts(database: DiaryDatabase = db): Promise<void> {
  await database.transaction('rw', database.products, database.metadata, async () => {
    if (await database.metadata.get('catalog-seeded')) return
    const missing: Product[] = []
    for (const product of initialProducts()) {
      if (!await database.products.get(product.id)) missing.push(readProduct(product))
    }
    assertRecordCapacity(await database.products.count(), missing.length)
    await database.products.bulkAdd(missing)
    const metadataCount = await database.metadata.where('id').notEqual(DIARY_GENERATION_ID).count()
    if (hasRecordCapacity(metadataCount)) {
      await database.metadata.put({ id: 'catalog-seeded', value: 'done' })
    }
  })
}

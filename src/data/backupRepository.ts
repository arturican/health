import { db, type DiaryDatabase } from './db'
import { readTextBackup, type TextBackup } from '../domain/backup'

export async function exportTextBackup(database: DiaryDatabase = db): Promise<TextBackup> {
  return database.transaction('r', database.profiles, database.weights, database.products, database.foodEntries, database.nutritionDays, async () => {
    const profile: unknown = await database.profiles.get('self')
    return readTextBackup({
      format: 'health-diary-text', version: 1, exportedAt: new Date().toISOString(),
      profile: profile ?? null,
      weights: await database.weights.toArray(),
      products: await database.products.toArray(),
      foodEntries: await database.foodEntries.toArray(),
      nutritionDays: await database.nutritionDays.toArray(),
    })
  })
}

export async function restoreTextBackup(input: unknown, database: DiaryDatabase = db): Promise<void> {
  const backup = readTextBackup(input)
  await database.transaction('rw', [database.profiles, database.weights, database.products, database.foodEntries, database.nutritionDays, database.metadata], async () => {
    await database.profiles.clear()
    await database.weights.clear()
    await database.products.clear()
    await database.foodEntries.clear()
    await database.nutritionDays.clear()
    if (backup.profile) await database.profiles.add(backup.profile)
    await database.weights.bulkAdd(backup.weights)
    await database.products.bulkAdd(backup.products)
    await database.foodEntries.bulkAdd(backup.foodEntries)
    await database.nutritionDays.bulkAdd(backup.nutritionDays)
    await database.metadata.delete('catalog-seeded')
  })
}

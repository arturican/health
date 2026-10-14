import { db, type DiaryDatabase } from './db'
import { textBackupSchema, type TextBackup } from '../domain/backup'
import { validate } from '../domain/schema'

export async function exportTextBackup(database: DiaryDatabase = db): Promise<TextBackup> {
  return database.transaction('r', database.profiles, database.weights, database.products, database.foodEntries, database.nutritionDays, async () => {
    const profile: unknown = await database.profiles.get('self')
    return validate(textBackupSchema, {
      format: 'health-diary-text', version: 1, exportedAt: new Date().toISOString(),
      profile: profile ?? null,
      weights: await database.weights.toArray(),
      products: await database.products.toArray(),
      foodEntries: await database.foodEntries.toArray(),
      nutritionDays: await database.nutritionDays.toArray(),
    })
  })
}

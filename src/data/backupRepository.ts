import { db, type DiaryDatabase } from './db'
import { readTextBackup, type TextBackup } from '../domain/backup'
import { advanceDiaryGeneration } from './clearDiary'

export async function exportTextBackup(database: DiaryDatabase = db): Promise<TextBackup> {
  return database.transaction('r', [database.profiles, database.weights, database.products, database.foodEntries, database.nutritionDays, database.steps, database.workouts, database.energyPlans], async () => {
    const profiles: unknown[] = await database.profiles.toArray()
    if (profiles.length > 1) throw new Error('В дневнике поддерживается один профиль')
    const profile = profiles[0]
    return readTextBackup({
      format: 'health-diary-text', version: 1, exportedAt: new Date().toISOString(),
      profile: profile ?? null,
      weights: await database.weights.toArray(),
      products: await database.products.toArray(),
      foodEntries: await database.foodEntries.toArray(),
      nutritionDays: await database.nutritionDays.toArray(),
      steps: await database.steps.toArray(),
      workouts: await database.workouts.toArray(),
      energyPlans: await database.energyPlans.toArray(),
    })
  })
}

export async function restoreTextBackup(input: unknown, database: DiaryDatabase = db): Promise<void> {
  const backup = readTextBackup(input)
  await database.transaction('rw', [database.profiles, database.weights, database.products, database.foodEntries, database.nutritionDays, database.steps, database.workouts, database.energyPlans, database.metadata], async () => {
    await database.profiles.clear()
    await database.weights.clear()
    await database.products.clear()
    await database.foodEntries.clear()
    await database.nutritionDays.clear()
    await database.steps.clear()
    await database.workouts.clear()
    await database.energyPlans.clear()
    if (backup.profile) await database.profiles.add(backup.profile)
    await database.weights.bulkAdd(backup.weights)
    await database.products.bulkAdd(backup.products)
    await database.foodEntries.bulkAdd(backup.foodEntries)
    await database.nutritionDays.bulkAdd(backup.nutritionDays)
    await database.steps.bulkAdd(backup.steps)
    await database.workouts.bulkAdd(backup.workouts)
    await database.energyPlans.bulkAdd(backup.energyPlans)
    await database.metadata.delete('catalog-seeded')
    await advanceDiaryGeneration(database)
  })
}

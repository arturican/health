import type { PoolClient } from 'pg'
import { z } from 'zod'
import type { TextBackup } from '../domain/backup'
import { entityId } from '../domain/schema'
import { DataError } from './httpErrors.js'
import { importRows } from './importRows.js'

export async function assertImportTarget(client: PoolClient, mode: 'empty' | 'replace') {
  if (mode === 'replace') return
  const result = await client.query<Record<string, unknown>>(`SELECT EXISTS(
    SELECT 1 FROM health.profiles UNION ALL SELECT 1 FROM health.products UNION ALL SELECT 1 FROM health.food_entries
    UNION ALL SELECT 1 FROM health.nutrition_days UNION ALL SELECT 1 FROM health.steps UNION ALL SELECT 1 FROM health.workouts
    UNION ALL SELECT 1 FROM health.energy_plans UNION ALL SELECT 1 FROM health.files UNION ALL SELECT 1 FROM health.legacy_metadata
    UNION ALL SELECT 1 FROM health.settings WHERE visibility_defined OR catalog_seeded) AS occupied`)
  if (z.object({ occupied: z.boolean() }).parse(result.rows[0]).occupied) throw new DataError(409)
}

// Только внутри write-транзакции владельца, после runtime-проверки копии.
export async function replaceTextSnapshot(client: PoolClient, owner: string, backup: TextBackup) {
  for (const table of ['food_entries', 'products', 'profiles', 'nutrition_days', 'steps', 'workouts', 'energy_plans', 'commands']) {
    await client.query(`DELETE FROM health.${table}`)
  }
  const p = backup.profile
  await importRows(client, owner, 'profiles', ['name', 'height_cm', 'birth_date', 'formula_sex'], p ? [[p.name, p.heightCm, p.birthDate, p.formulaSex]] : [])
  await importRows(client, owner, 'weights', ['id', 'date', 'kg'], backup.weights.map(row => [row.id, row.date, row.kg]))
  await importRows(client, owner, 'products', ['id', 'name', 'source', 'kcal', 'protein', 'fat', 'carbs', 'archived'],
    backup.products.map(row => [row.id, row.name, row.source, row.kcal, row.protein, row.fat, row.carbs, row.archived]))
  await importRows(client, owner, 'food_entries', ['id', 'date', 'meal', 'product_id', 'grams', 'note', 'name', 'source', 'kcal', 'protein', 'fat', 'carbs'],
    backup.foodEntries.map(row => [row.id, row.date, row.meal, row.productId, row.grams, row.note, row.snapshot.name,
      row.snapshot.source, row.snapshot.kcal, row.snapshot.protein, row.snapshot.fat, row.snapshot.carbs]))
  await importRows(client, owner, 'nutrition_days', ['date', 'complete'], backup.nutritionDays.map(row => [row.date, row.complete]))
  await importRows(client, owner, 'steps', ['date', 'count'], backup.steps.map(row => [row.date, row.count]))
  await importRows(client, owner, 'workouts', ['id', 'date', 'kind', 'minutes', 'kcal', 'source', 'note'],
    backup.workouts.map(row => [row.id, row.date, row.kind, row.minutes, row.kcal, row.source, row.note]))
  await importRows(client, owner, 'energy_plans', ['id', 'revision', 'effective_from', 'created_on', 'goal_kcal', 'method', 'manual_kcal', 'factor', 'source',
    'resting_formula', 'snapshot_kg', 'snapshot_weight_date', 'snapshot_height_cm', 'snapshot_age', 'snapshot_formula_sex'],
  backup.energyPlans.map(row => [row.id, row.revision, row.effectiveFrom, row.createdOn, row.goalKcal, row.method, row.manualKcal, row.factor, row.source,
    row.restingFormula, row.snapshot.kg, row.snapshot.weightDate, row.snapshot.heightCm, row.snapshot.age, row.snapshot.formulaSex]))
  const result = await client.query<Record<string, unknown>>(`UPDATE health.settings SET generation=gen_random_uuid(),catalog_seeded=false,updated_at=now()
    RETURNING generation`)
  return z.object({ generation: entityId }).parse(result.rows[0])
}

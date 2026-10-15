import type { PoolClient } from 'pg'
import { BACKUP_MAX_RECORDS, readTextBackup } from '../domain/backup'
import { getProfileRecord } from './profileRecords.js'

// Только фиксированные имена/выражения сервера; ввод запроса сюда не подставляется.
const tables = [
  ['weights', 'weights', "'id',id,'date',date,'kg',kg"],
  ['products', 'products', "'id',id,'name',name,'source',source,'kcal',kcal,'protein',protein,'fat',fat,'carbs',carbs,'archived',archived"],
  ['foodEntries', 'food_entries', `'id',id,'date',date,'meal',meal,'productId',product_id,'grams',grams,'note',note,
    'snapshot',jsonb_build_object('name',name,'source',source,'kcal',kcal,'protein',protein,'fat',fat,'carbs',carbs)`],
  ['nutritionDays', 'nutrition_days', "'date',date,'complete',complete"],
  ['steps', 'steps', "'date',date,'count',count"],
  ['workouts', 'workouts', "'id',id,'date',date,'kind',kind,'minutes',minutes,'kcal',kcal,'source',source,'note',note"],
  ['energyPlans', 'energy_plans', `'id',id,'effectiveFrom',effective_from,'createdOn',created_on,'revision',revision,
    'goalKcal',goal_kcal,'method',method,'manualKcal',manual_kcal,'factor',factor,'source',source,'restingFormula',resting_formula,
    'snapshot',jsonb_build_object('kg',snapshot_kg,'weightDate',snapshot_weight_date,'heightCm',snapshot_height_cm,
      'age',snapshot_age,'formulaSex',snapshot_formula_sex)`],
] as const

export async function readTextSnapshot(client: PoolClient, today: string, exportedAt: string) {
  const profile = await getProfileRecord(client, today)
  const values: Record<string, unknown> = {}
  for (const [key, table, fields] of tables) {
    const order = key === 'nutritionDays' || key === 'steps' ? 'date' : 'id'
    const result = await client.query<Record<string, unknown>>(`SELECT jsonb_build_object(${fields}) AS value FROM health.${table}
      ORDER BY ${order} LIMIT $1`, [BACKUP_MAX_RECORDS + 1])
    values[key] = result.rows.map(row => row['value'])
  }
  return readTextBackup({ format: 'health-diary-text', version: 1, exportedAt, profile: profile?.value ?? null, ...values }, today)
}

export function backupJSON(value: unknown, maxBytes: number) {
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw Object.assign(new Error('Копия превышает лимит'), { statusCode: 413 })
  return serialized
}

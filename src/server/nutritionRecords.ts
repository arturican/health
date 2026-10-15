import type { PoolClient } from 'pg'
import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { mealSchema, nutritionDaySchema } from '../domain/nutrition'
import { calendarDate, entityId } from '../domain/schema'
import { runCommand } from './commands.js'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

export async function getNutritionRecord(client: PoolClient, dateInput: unknown) {
  const date = inputValue(() => calendarDate.parse(dateInput))
  const result = await client.query<Record<string, unknown>>(`SELECT jsonb_build_object('date',date,'complete',complete) AS value,
    revision::text FROM health.nutrition_days WHERE date=$1`, [date])
  return result.rows[0] ? z.object({ value: nutritionDaySchema, revision: storedRevision }).parse(result.rows[0]) : null
}

export async function saveNutritionRecord(client: PoolClient, owner: string, dateInput: unknown, input: unknown, today: string) {
  const date = inputValue(() => calendarDate.parse(dateInput))
  const { value, revision } = inputValue(() => z.strictObject({ value: nutritionDaySchema, revision: revisionInput.nullable() }).parse(input))
  if (date !== value.date || date > today) throw new DataError(400)
  const previous = await getNutritionRecord(client, date)
  if ((previous?.revision ?? null) !== revision) throw new DataError(409)
  if (previous) {
    const result = await client.query(`UPDATE health.nutrition_days SET complete=$3,revision=revision+1,updated_at=now()
      WHERE user_id=$1 AND date=$2 AND revision=$4`, [owner, date, value.complete, revision])
    if (result.rowCount !== 1) throw new DataError(409)
  } else {
    const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.nutrition_days')
    if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
    await client.query('INSERT INTO health.nutrition_days(user_id,date,complete) VALUES ($1,$2,$3)', [owner, date, value.complete])
  }
  return getNutritionRecord(client, date)
}

export async function copyMealRecords(client: PoolClient, owner: string, input: unknown, today: string) {
  const { commandId, source, meal, target } = inputValue(() => z.strictObject({
    commandId: entityId, source: calendarDate, meal: mealSchema, target: calendarDate,
  }).parse(input))
  if (source === target || source > today || target > today) throw new DataError(400)
  const request = { operation: 'copyMeal', source, meal, target }
  return runCommand(client, owner, commandId, request, z.object({ count: z.number().int().positive().max(BACKUP_MAX_RECORDS) }), async () => {
    const counts = await client.query<Record<string, unknown>>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE date=$1 AND meal=$2)::text AS selected FROM health.food_entries`, [source, meal])
    const { total, selected } = z.object({ total: z.coerce.number(), selected: z.coerce.number() }).parse(counts.rows[0])
    if (selected === 0 || total + selected > BACKUP_MAX_RECORDS) throw new DataError(400)
    const result = await client.query(`INSERT INTO health.food_entries(user_id,id,date,meal,product_id,grams,note,name,source,kcal,protein,fat,carbs)
      SELECT user_id,gen_random_uuid(),$3,meal,product_id,grams,note,name,source,kcal,protein,fat,carbs
      FROM health.food_entries WHERE date=$1 AND meal=$2`, [source, meal, target])
    if (result.rowCount !== selected) throw new Error('Копирование не завершено')
    return { count: selected }
  })
}

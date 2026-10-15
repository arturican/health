import type { PoolClient } from 'pg'
import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { foodEntrySchema } from '../domain/nutrition'
import { calendarDate, entityId } from '../domain/schema'
import { DataError, inputValue } from './httpErrors.js'
import { getProductRecord } from './productRecords.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const editSchema = foodEntrySchema.pick({ id: true, date: true, meal: true, grams: true, note: true })
const createSchema = editSchema.extend({ productId: entityId })
const rowSchema = z.object({ value: foodEntrySchema, revision: storedRevision })
const projection = `jsonb_build_object('id',id,'date',date,'meal',meal,'productId',product_id,
  'grams',grams,'note',note,'snapshot',jsonb_build_object('name',name,'source',source,'kcal',kcal,
  'protein',protein,'fat',fat,'carbs',carbs)) AS value, revision::text`

async function getFoodRecord(client: PoolClient, id: string) {
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.food_entries WHERE id=$1`, [id])
  return result.rows[0] ? rowSchema.parse(result.rows[0]) : null
}

export async function listFoodRecords(client: PoolClient, input: unknown, today: string) {
  const query = inputValue(() => z.strictObject({ date: calendarDate.default(today), after: entityId.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.food_entries
    WHERE date=$1 AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3`, [query.date, query.after ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextAfter: records.length > query.limit ? items.at(-1)?.value.id ?? null : null }
}

export async function createFoodRecord(client: PoolClient, owner: string, input: unknown, today: string) {
  const { value } = inputValue(() => z.strictObject({ value: createSchema, revision: z.null() }).parse(input))
  if (value.date > today) throw new DataError(400)
  if (await getFoodRecord(client, value.id)) throw new DataError(409)
  const product = await getProductRecord(client, value.productId)
  if (!product) throw new DataError(404)
  if (product.value.archived) throw new DataError(409)
  const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.food_entries')
  if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
  const snapshot = product.value
  await client.query(`INSERT INTO health.food_entries(user_id,id,date,meal,product_id,grams,note,name,source,kcal,protein,fat,carbs)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  [owner, value.id, value.date, value.meal, value.productId, value.grams, value.note,
    snapshot.name, snapshot.source, snapshot.kcal, snapshot.protein, snapshot.fat, snapshot.carbs])
  return getFoodRecord(client, value.id)
}

export async function updateFoodRecord(client: PoolClient, idInput: unknown, input: unknown, today: string) {
  const { value, revision } = inputValue(() => z.strictObject({ value: editSchema, revision: revisionInput }).parse(input))
  const id = inputValue(() => entityId.parse(idInput))
  if (id !== value.id || value.date > today) throw new DataError(400)
  const existing = await getFoodRecord(client, id)
  if (!existing) throw new DataError(404)
  if (existing.revision !== revision) throw new DataError(409)
  const result = await client.query(`UPDATE health.food_entries SET date=$2,meal=$3,grams=$4,note=$5,
    revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$6`, [id, value.date, value.meal, value.grams, value.note, revision])
  if (result.rowCount !== 1) throw new DataError(409)
  return getFoodRecord(client, id)
}

export async function deleteFoodRecord(client: PoolClient, idInput: unknown, input: unknown) {
  const id = inputValue(() => entityId.parse(idInput))
  const { revision } = inputValue(() => z.strictObject({ revision: revisionInput }).parse(input))
  const existing = await getFoodRecord(client, id)
  if (!existing) throw new DataError(404)
  if (existing.revision !== revision) throw new DataError(409)
  const result = await client.query('DELETE FROM health.food_entries WHERE id=$1 AND revision=$2', [id, revision])
  if (result.rowCount !== 1) throw new DataError(409)
}

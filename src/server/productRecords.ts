import type { PoolClient } from 'pg'
import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { productSchema } from '../domain/nutrition'
import { entityId } from '../domain/schema'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const rowSchema = z.object({ value: productSchema, revision: storedRevision })
const projection = `jsonb_build_object('id',id,'name',name,'source',source,'kcal',kcal,
  'protein',protein,'fat',fat,'carbs',carbs,'archived',archived) AS value, revision::text`

export async function getProductRecord(client: PoolClient, idInput: unknown) {
  const id = inputValue(() => entityId.parse(idInput))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.products WHERE id=$1`, [id])
  return result.rows[0] ? rowSchema.parse(result.rows[0]) : null
}

export async function listProductRecords(client: PoolClient, input: unknown) {
  const query = inputValue(() => z.strictObject({
    archived: z.enum(['true', 'false']).default('false'), after: entityId.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.products
    WHERE ($1 OR NOT archived) AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3`,
  [query.archived === 'true', query.after ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextAfter: records.length > query.limit ? items.at(-1)?.value.id ?? null : null }
}

export async function saveProductRecord(client: PoolClient, owner: string, input: unknown, idInput?: unknown) {
  const update = idInput !== undefined
  const { value, revision } = inputValue(() => z.strictObject({ value: productSchema, revision: revisionInput.nullable() }).parse(input))
  const id = inputValue(() => entityId.parse(update ? idInput : value.id))
  if (id !== value.id || update !== (revision !== null)) throw new DataError(400)
  const existing = await getProductRecord(client, id)
  if (update && !existing) throw new DataError(404)
  if (existing && (!update || existing.revision !== revision)) throw new DataError(409)
  const values = [owner, id, value.name, value.source, value.kcal, value.protein, value.fat, value.carbs, value.archived]
  if (update) {
    const result = await client.query(`UPDATE health.products SET name=$3,source=$4,kcal=$5,protein=$6,fat=$7,carbs=$8,
      archived=$9,revision=revision+1,updated_at=now() WHERE user_id=$1 AND id=$2 AND revision=$10`, [...values, revision])
    if (result.rowCount !== 1) throw new DataError(409)
  } else {
    const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.products')
    if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
    await client.query(`INSERT INTO health.products(user_id,id,name,source,kcal,protein,fat,carbs,archived)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, values)
  }
  return getProductRecord(client, id)
}

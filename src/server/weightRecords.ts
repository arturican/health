import type { PoolClient } from 'pg'
import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { weightSchema } from '../domain/profile'
import { calendarDate, entityId } from '../domain/schema'
import { DataError, inputValue } from './httpErrors.js'
import { getProfileRecord, revisionInput, storedRevision } from './profileRecords.js'
import { readServerWeight } from './recordValidation.js'

const rowSchema = z.object({ value: weightSchema, revision: storedRevision })
const projection = "jsonb_build_object('id',id,'date',date,'kg',kg) AS value, revision::text"

export async function listWeightRecords(client: PoolClient, input: unknown, today: string) {
  const query = inputValue(() => z.strictObject({
    asOf: calendarDate.default(today), before: calendarDate.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.weights
    WHERE date <= $1 AND ($2::date IS NULL OR date < $2) ORDER BY date DESC LIMIT $3`,
  [query.asOf, query.before ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextBefore: records.length > query.limit ? items.at(-1)?.value.date ?? null : null }
}

async function findWeight(client: PoolClient, id: string) {
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.weights WHERE id=$1`, [id])
  return result.rows[0] ? rowSchema.parse(result.rows[0]) : null
}

export async function saveWeightRecord(client: PoolClient, owner: string, input: unknown, today: string, idInput?: unknown) {
  const update = idInput !== undefined
  const body = inputValue(() => z.strictObject({ value: weightSchema, revision: revisionInput.nullable() }).parse(input))
  const id = inputValue(() => entityId.parse(update ? idInput : body.value.id))
  if (id !== body.value.id || update !== (body.revision !== null)) throw new DataError(400)
  const existing = await findWeight(client, id)
  if (update && !existing) throw new DataError(404)
  if (existing && (!update || existing.revision !== body.revision)) throw new DataError(409)
  const profile = await getProfileRecord(client, today)
  if (!profile) throw new DataError(400)
  const value = inputValue(() => readServerWeight(body.value, today, profile.value.birthDate))
  const conflict = await client.query('SELECT 1 FROM health.weights WHERE date=$1 AND id<>$2', [value.date, id])
  if (conflict.rowCount !== 0) throw new DataError(409)
  if (update) {
    const result = await client.query(`UPDATE health.weights SET date=$3,kg=$4,revision=revision+1,updated_at=now()
      WHERE user_id=$1 AND id=$2 AND revision=$5`, [owner, id, value.date, value.kg, body.revision])
    if (result.rowCount !== 1) throw new DataError(409)
  } else {
    const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.weights')
    if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
    await client.query('INSERT INTO health.weights(user_id,id,date,kg) VALUES ($1,$2,$3,$4)', [owner, id, value.date, value.kg])
  }
  return findWeight(client, id)
}

export async function deleteWeightRecord(client: PoolClient, idInput: unknown, input: unknown) {
  const { id, revision } = inputValue(() => ({ id: entityId.parse(idInput),
    revision: z.strictObject({ revision: revisionInput }).parse(input).revision }))
  const existing = await findWeight(client, id)
  if (!existing) throw new DataError(404)
  if (existing.revision !== revision) throw new DataError(409)
  const result = await client.query('DELETE FROM health.weights WHERE id=$1 AND revision=$2', [id, revision])
  if (result.rowCount !== 1) throw new DataError(409)
}

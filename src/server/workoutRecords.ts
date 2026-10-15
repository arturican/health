import type { PoolClient } from 'pg'
import { z } from 'zod'
import { workoutSchema } from '../domain/activity'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { calendarDate, entityId } from '../domain/schema'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const rowSchema = z.object({ value: workoutSchema, revision: storedRevision })
const projection = `jsonb_build_object('id',id,'date',date,'kind',kind,'minutes',minutes,'kcal',kcal,
  'source',source,'note',note) AS value,revision::text`

async function getWorkoutRecord(client: PoolClient, id: string) {
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.workouts WHERE id=$1`, [id])
  return result.rows[0] ? rowSchema.parse(result.rows[0]) : null
}

export async function listWorkoutRecords(client: PoolClient, input: unknown, today: string) {
  const query = inputValue(() => z.strictObject({ date: calendarDate.default(today), after: entityId.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.workouts
    WHERE date=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`, [query.date, query.after ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextAfter: records.length > query.limit ? items.at(-1)?.value.id ?? null : null }
}

export async function saveWorkoutRecord(client: PoolClient, owner: string, input: unknown, today: string, idInput?: unknown) {
  const update = idInput !== undefined
  const { value, revision } = inputValue(() => z.strictObject({ value: workoutSchema, revision: revisionInput.nullable() }).parse(input))
  const id = inputValue(() => entityId.parse(update ? idInput : value.id))
  if (id !== value.id || update !== (revision !== null) || value.date > today) throw new DataError(400)
  const previous = await getWorkoutRecord(client, id)
  if (update && !previous) throw new DataError(404)
  if (previous && (!update || previous.revision !== revision)) throw new DataError(409)
  const values = [owner, id, value.date, value.kind, value.minutes, value.kcal, value.source, value.note]
  if (update) {
    const result = await client.query(`UPDATE health.workouts SET date=$3,kind=$4,minutes=$5,kcal=$6,source=$7,note=$8,
      revision=revision+1,updated_at=now() WHERE user_id=$1 AND id=$2 AND revision=$9`, [...values, revision])
    if (result.rowCount !== 1) throw new DataError(409)
  } else {
    const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.workouts')
    if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
    await client.query(`INSERT INTO health.workouts(user_id,id,date,kind,minutes,kcal,source,note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, values)
  }
  return getWorkoutRecord(client, id)
}

export async function deleteWorkoutRecord(client: PoolClient, idInput: unknown, input: unknown) {
  const id = inputValue(() => entityId.parse(idInput))
  const { revision } = inputValue(() => z.strictObject({ revision: revisionInput }).parse(input))
  const previous = await getWorkoutRecord(client, id)
  if (!previous) throw new DataError(404)
  if (previous.revision !== revision) throw new DataError(409)
  const result = await client.query('DELETE FROM health.workouts WHERE id=$1 AND revision=$2', [id, revision])
  if (result.rowCount !== 1) throw new DataError(409)
}

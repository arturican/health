import type { PoolClient } from 'pg'
import { z } from 'zod'
import { stepsSchema } from '../domain/activity'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { calendarDate } from '../domain/schema'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const rowSchema = z.object({ value: stepsSchema, revision: storedRevision })
const projection = "jsonb_build_object('date',date,'count',count) AS value,revision::text"

export async function getStepsRecord(client: PoolClient, dateInput: unknown) {
  const date = inputValue(() => calendarDate.parse(dateInput))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.steps WHERE date=$1`, [date])
  return result.rows[0] ? rowSchema.parse(result.rows[0]) : null
}

export async function listStepsRecords(client: PoolClient, input: unknown, today: string) {
  const query = inputValue(() => z.strictObject({ from: calendarDate.default('0001-01-01'), to: calendarDate.default(today),
    before: calendarDate.optional(), limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  if (query.from > query.to) throw new DataError(400)
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.steps
    WHERE date BETWEEN $1 AND $2 AND ($3::date IS NULL OR date < $3) ORDER BY date DESC LIMIT $4`,
  [query.from, query.to, query.before ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextBefore: records.length > query.limit ? items.at(-1)?.value.date ?? null : null }
}

export async function saveStepsRecord(client: PoolClient, owner: string, dateInput: unknown, input: unknown, today: string) {
  const date = inputValue(() => calendarDate.parse(dateInput))
  const { value, revision } = inputValue(() => z.strictObject({ value: stepsSchema, revision: revisionInput.nullable() }).parse(input))
  if (date !== value.date || date > today) throw new DataError(400)
  const previous = await getStepsRecord(client, date)
  if ((previous?.revision ?? null) !== revision) throw new DataError(409)
  if (previous) {
    const result = await client.query(`UPDATE health.steps SET count=$3,revision=revision+1,updated_at=now()
      WHERE user_id=$1 AND date=$2 AND revision=$4`, [owner, date, value.count, revision])
    if (result.rowCount !== 1) throw new DataError(409)
  } else {
    const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.steps')
    if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
    await client.query('INSERT INTO health.steps(user_id,date,count) VALUES ($1,$2,$3)', [owner, date, value.count])
  }
  return getStepsRecord(client, date)
}

export async function deleteStepsRecord(client: PoolClient, dateInput: unknown, input: unknown) {
  const date = inputValue(() => calendarDate.parse(dateInput))
  const { revision } = inputValue(() => z.strictObject({ revision: revisionInput }).parse(input))
  const previous = await getStepsRecord(client, date)
  if (!previous) throw new DataError(404)
  if (previous.revision !== revision) throw new DataError(409)
  const result = await client.query('DELETE FROM health.steps WHERE date=$1 AND revision=$2', [date, revision])
  if (result.rowCount !== 1) throw new DataError(409)
}

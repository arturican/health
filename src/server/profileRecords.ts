import type { PoolClient } from 'pg'
import { z } from 'zod'
import { readServerProfile, readServerWeight } from './recordValidation.js'
import { DataError, inputValue } from './httpErrors.js'

export const revisionInput = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1)
export const storedRevision = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(Number.MAX_SAFE_INTEGER))

export async function getProfileRecord(client: PoolClient, today: string) {
  const result = await client.query<Record<string, unknown>>(`SELECT jsonb_build_object('id','self','name',name,
    'heightCm',height_cm,'birthDate',birth_date,'formulaSex',formula_sex) AS value, revision::text FROM health.profiles`)
  if (!result.rows[0]) return null
  const row = z.object({ value: z.unknown(), revision: storedRevision }).parse(result.rows[0])
  return { value: readServerProfile(row.value, today), revision: row.revision }
}

export async function createProfileRecord(client: PoolClient, owner: string, input: unknown, today: string) {
  const values = inputValue(() => {
    const body = z.strictObject({ profile: z.unknown(), weight: z.unknown() }).parse(input)
    const profile = readServerProfile(body.profile, today)
    return { profile, weight: readServerWeight(body.weight, today, profile.birthDate) }
  })
  if (await getProfileRecord(client, today)) throw new DataError(409)
  const { profile, weight } = values
  await client.query('INSERT INTO health.profiles(user_id,name,height_cm,birth_date,formula_sex) VALUES ($1,$2,$3,$4,$5)',
    [owner, profile.name, profile.heightCm, profile.birthDate, profile.formulaSex])
  await client.query('INSERT INTO health.weights(user_id,id,date,kg) VALUES ($1,$2,$3,$4)', [owner, weight.id, weight.date, weight.kg])
  return getProfileRecord(client, today)
}

export async function updateProfileRecord(client: PoolClient, owner: string, input: unknown, today: string) {
  const { profile, revision } = inputValue(() => {
    const body = z.strictObject({ value: z.unknown(), revision: revisionInput }).parse(input)
    return { profile: readServerProfile(body.value, today), revision: body.revision }
  })
  const existing = await getProfileRecord(client, today)
  if (!existing) throw new DataError(404)
  if (existing.revision !== revision) throw new DataError(409)
  const first = await client.query<Record<string, unknown>>('SELECT min(date)::text AS date FROM health.weights')
  const earliest = z.object({ date: z.string().nullable() }).parse(first.rows[0]).date
  if (profile.birthDate !== null && earliest !== null && profile.birthDate > earliest) throw new DataError(400)
  const result = await client.query(`UPDATE health.profiles SET name=$2,height_cm=$3,birth_date=$4,formula_sex=$5,
    revision=revision+1,updated_at=now() WHERE user_id=$1 AND revision=$6`,
  [owner, profile.name, profile.heightCm, profile.birthDate, profile.formulaSex, revision])
  if (result.rowCount !== 1) throw new DataError(409)
  return getProfileRecord(client, today)
}

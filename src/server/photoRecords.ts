import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { photoInputSchema, photoSchema } from '../domain/photo'
import { entityId } from '../domain/schema'
import type { validateServerAttachment } from './attachmentValidation.js'
import { runCommand } from './commands.js'
import { insertFile } from './fileRecords.js'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const recordSchema = z.object({ value: photoSchema, revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
const rowSchema = recordSchema.extend({ revision: storedRevision })
const projection = `jsonb_build_object('id',id,'fileId',file_id,'date',date,'title',title,'note',note,
  'width',width,'height',height) AS value,revision::text`

export function readPhotoUpload(input: unknown, today: string) {
  const values = inputValue(() => photoInputSchema.extend({ id: entityId, fileId: entityId, mime: z.literal('image/jpeg') }).parse(input))
  if (values.date > today) throw new DataError(400)
  return values
}

async function getPhotoRecord(client: PoolClient, id: string) {
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.photos WHERE id=$1`, [id])
  return result.rows[0] ? rowSchema.parse(result.rows[0]) : null
}

export async function listPhotoRecords(client: PoolClient, input: unknown) {
  const query = inputValue(() => z.strictObject({ after: entityId.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.photos
    WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2`, [query.after ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextAfter: records.length > query.limit ? items.at(-1)?.value.id ?? null : null }
}

export async function createPhotoRecord(client: PoolClient, owner: string, values: ReturnType<typeof readPhotoUpload>, file: Awaited<ReturnType<typeof validateServerAttachment>>) {
  if (!file.dimensions || file.purpose !== 'photo' || file.mime !== 'image/jpeg') throw new DataError(400)
  const value = photoSchema.parse({ id: values.id, fileId: values.fileId, date: values.date, title: values.title, note: values.note, ...file.dimensions })
  return runCommand(client, owner, value.id, { operation: 'createPhoto', values, sha256: createHash('sha256').update(file.bytes).digest('hex') }, recordSchema, async () => {
    if (await getPhotoRecord(client, value.id)) throw new DataError(409)
    await insertFile(client, owner, value.fileId, file)
    await client.query(`INSERT INTO health.photos(user_id,id,file_id,date,title,note,width,height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [owner, value.id, value.fileId, value.date, value.title, value.note, value.width, value.height])
    return { value, revision: 1 }
  })
}

export async function updatePhotoRecord(client: PoolClient, idInput: unknown, input: unknown, today: string) {
  const id = inputValue(() => entityId.parse(idInput))
  const { value, revision } = inputValue(() => z.strictObject({ value: photoInputSchema, revision: revisionInput }).parse(input))
  if (value.date > today) throw new DataError(400)
  const previous = await getPhotoRecord(client, id)
  if (!previous) throw new DataError(404)
  if (previous.revision !== revision) throw new DataError(409)
  const result = await client.query(`UPDATE health.photos SET date=$2,title=$3,note=$4,revision=revision+1,updated_at=now()
    WHERE id=$1 AND revision=$5`, [id, value.date, value.title, value.note, revision])
  if (result.rowCount !== 1) throw new DataError(409)
  return getPhotoRecord(client, id)
}

export async function deletePhotoRecord(client: PoolClient, idInput: unknown, input: unknown) {
  const id = inputValue(() => entityId.parse(idInput))
  const { revision } = inputValue(() => z.strictObject({ revision: revisionInput }).parse(input))
  const previous = await getPhotoRecord(client, id)
  if (!previous) throw new DataError(404)
  if (previous.revision !== revision) throw new DataError(409)
  await client.query('DELETE FROM health.files WHERE id=$1', [previous.value.fileId])
}

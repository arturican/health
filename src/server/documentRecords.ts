import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { attachmentMimes } from '../domain/attachment'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { documentInputSchema, documentSchema } from '../domain/document'
import { entityId } from '../domain/schema'
import type { validateServerAttachment } from './attachmentValidation.js'
import { runCommand } from './commands.js'
import { insertFile } from './fileRecords.js'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const recordSchema = z.object({ value: documentSchema, revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
const rowSchema = recordSchema.extend({ revision: storedRevision })
const projection = `jsonb_build_object('id',id,'fileId',file_id,'date',date,'title',title,'kind',kind,'note',note) AS value,revision::text`

export function readDocumentUpload(input: unknown, today: string) {
  const values = inputValue(() => documentInputSchema.extend({ id: entityId, fileId: entityId, mime: z.enum(attachmentMimes) }).parse(input))
  if (values.date > today) throw new DataError(400)
  return values
}

export async function getDocumentRecord(client: PoolClient, idInput: unknown) {
  const id = inputValue(() => entityId.parse(idInput))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.documents WHERE id=$1`, [id])
  if (!result.rows[0]) throw new DataError(404)
  return rowSchema.parse(result.rows[0])
}

export async function listDocumentRecords(client: PoolClient, input: unknown) {
  const query = inputValue(() => z.strictObject({ after: entityId.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM health.documents
    WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2`, [query.after ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextAfter: records.length > query.limit ? items.at(-1)?.value.id ?? null : null }
}

export async function createDocumentRecord(client: PoolClient, owner: string, values: ReturnType<typeof readDocumentUpload>, file: Awaited<ReturnType<typeof validateServerAttachment>>) {
  if (file.purpose !== 'document' || file.mime !== values.mime) throw new DataError(400)
  const value = documentSchema.parse({ id: values.id, fileId: values.fileId, date: values.date, title: values.title, kind: values.kind, note: values.note })
  return runCommand(client, owner, value.id, { operation: 'createDocument', values, sha256: createHash('sha256').update(file.bytes).digest('hex') }, recordSchema, async () => {
    if ((await client.query('SELECT 1 FROM health.documents WHERE id=$1', [value.id])).rowCount !== 0) throw new DataError(409)
    await insertFile(client, owner, value.fileId, file)
    await client.query('INSERT INTO health.documents(user_id,id,file_id,date,title,kind,note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [owner, value.id, value.fileId, value.date, value.title, value.kind, value.note])
    return { value, revision: 1 }
  })
}

export async function updateDocumentRecord(client: PoolClient, idInput: unknown, input: unknown, today: string) {
  const id = inputValue(() => entityId.parse(idInput))
  const { value, revision } = inputValue(() => z.strictObject({ value: documentInputSchema, revision: revisionInput }).parse(input))
  if (value.date > today) throw new DataError(400)
  const previous = await getDocumentRecord(client, id)
  if (previous.revision !== revision) throw new DataError(409)
  const result = await client.query(`UPDATE health.documents SET date=$2,title=$3,kind=$4,note=$5,revision=revision+1,updated_at=now()
    WHERE id=$1 AND revision=$6`, [id, value.date, value.title, value.kind, value.note, revision])
  if (result.rowCount !== 1) throw new DataError(409)
  return getDocumentRecord(client, id)
}

export async function countDocumentRecords(client: PoolClient, idInput: unknown) {
  const document = await getDocumentRecord(client, idInput)
  const result = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.lab_results WHERE document_id=$1', [document.value.id])
  return { count: z.object({ count: z.coerce.number().int().min(0) }).parse(result.rows[0]).count, revision: document.revision }
}

export async function deleteDocumentRecord(client: PoolClient, idInput: unknown, input: unknown) {
  const { revision, expectedResults } = inputValue(() => z.strictObject({ revision: revisionInput,
    expectedResults: z.number().int().min(0).max(BACKUP_MAX_RECORDS).nullable(),
  }).parse(input))
  const previous = await getDocumentRecord(client, idInput)
  if (previous.revision !== revision) throw new DataError(409)
  const { count } = await countDocumentRecords(client, idInput)
  if (expectedResults === null ? count > 0 : count !== expectedResults) throw new DataError(409)
  await client.query('DELETE FROM health.files WHERE id=$1', [previous.value.fileId])
}

import type { PoolClient } from 'pg'
import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { documentSchema } from '../domain/document'
import { labResultSchema } from '../domain/labResult'
import { entityId } from '../domain/schema'
import { getDocumentRecord } from './documentRecords.js'
import { DataError, inputValue } from './httpErrors.js'
import { revisionInput, storedRevision } from './profileRecords.js'

const rowSchema = z.object({ value: labResultSchema, revision: storedRevision, document: documentSchema })
const projection = `jsonb_build_object('id',r.id,'documentId',r.document_id,'date',r.date,'name',r.name,
  'value',CASE WHEN r.value_type='number' THEN jsonb_build_object('type','number','number',r.value_number,'operator',r.value_operator)
    ELSE jsonb_build_object('type','text','text',r.value_text) END,
  'unit',r.unit,'reference',r.reference,'note',r.note) AS value,r.revision::text,
  jsonb_build_object('id',d.id,'fileId',d.file_id,'date',d.date,'title',d.title,'kind',d.kind,'note',d.note) AS document`
const source = 'health.lab_results r JOIN health.documents d ON d.user_id=r.user_id AND d.id=r.document_id'

async function getLabRecord(client: PoolClient, id: string) {
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM ${source} WHERE r.id=$1`, [id])
  return result.rows[0] ? rowSchema.parse(result.rows[0]) : null
}

export async function listLabRecords(client: PoolClient, input: unknown) {
  const query = inputValue(() => z.strictObject({ documentId: entityId.optional(), after: entityId.optional(),
    limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(100),
  }).parse(input))
  if (query.documentId) await getDocumentRecord(client, query.documentId)
  const result = await client.query<Record<string, unknown>>(`SELECT ${projection} FROM ${source}
    WHERE ($1::uuid IS NULL OR r.document_id=$1) AND ($2::uuid IS NULL OR r.id>$2) ORDER BY r.id LIMIT $3`,
  [query.documentId ?? null, query.after ?? null, query.limit + 1])
  const records = result.rows.map(row => rowSchema.parse(row))
  const items = records.slice(0, query.limit)
  return { items, nextAfter: records.length > query.limit ? items.at(-1)?.value.id ?? null : null }
}

async function touchDocument(client: PoolClient, id: string) {
  const result = await client.query(`UPDATE health.documents SET revision=revision+1,updated_at=now()
    WHERE id=$1 AND revision<9007199254740991`, [id])
  if (result.rowCount !== 1) throw new DataError(409)
}

export async function saveLabRecord(client: PoolClient, owner: string, input: unknown, today: string, idInput?: unknown) {
  const update = idInput !== undefined
  const { value, revision } = inputValue(() => z.strictObject({ value: labResultSchema, revision: revisionInput.nullable() }).parse(input))
  const id = inputValue(() => entityId.parse(update ? idInput : value.id))
  if (id !== value.id || update !== (revision !== null) || value.date > today) throw new DataError(400)
  const previous = await getLabRecord(client, id)
  if (update && !previous) throw new DataError(404)
  if (previous && (!update || previous.revision !== revision)) throw new DataError(409)
  if (previous && previous.value.documentId !== value.documentId) throw new DataError(400)
  await getDocumentRecord(client, value.documentId)
  const values = [owner, id, value.documentId, value.date, value.name, value.value.type,
    value.value.type === 'number' ? value.value.number : null, value.value.type === 'number' ? value.value.operator : null,
    value.value.type === 'text' ? value.value.text : null, value.unit, value.reference, value.note]
  if (update) {
    const result = await client.query(`UPDATE health.lab_results SET date=$4,name=$5,value_type=$6,value_number=$7,
      value_operator=$8,value_text=$9,unit=$10,reference=$11,note=$12,revision=revision+1,updated_at=now()
      WHERE user_id=$1 AND id=$2 AND document_id=$3 AND revision=$13`, [...values, revision])
    if (result.rowCount !== 1) throw new DataError(409)
  } else {
    const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.lab_results')
    if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
    await client.query(`INSERT INTO health.lab_results(user_id,id,document_id,date,name,value_type,value_number,value_operator,value_text,unit,reference,note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, values)
  }
  await touchDocument(client, value.documentId)
  return getLabRecord(client, id)
}

export async function deleteLabRecord(client: PoolClient, idInput: unknown, input: unknown) {
  const id = inputValue(() => entityId.parse(idInput))
  const { revision } = inputValue(() => z.strictObject({ revision: revisionInput }).parse(input))
  const previous = await getLabRecord(client, id)
  if (!previous) throw new DataError(404)
  if (previous.revision !== revision) throw new DataError(409)
  const result = await client.query('DELETE FROM health.lab_results WHERE id=$1 AND revision=$2', [id, revision])
  if (result.rowCount !== 1) throw new DataError(409)
  await touchDocument(client, previous.value.documentId)
}

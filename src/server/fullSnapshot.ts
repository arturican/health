import type { PoolClient } from 'pg'
import { z } from 'zod'
import { attachmentMimes, attachmentPurposeSchema } from '../domain/attachment'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { readFullBackup, type BackupFile } from '../domain/fullBackup'
import { photoSchema } from '../domain/photo'
import { entityId } from '../domain/schema'
import { FILE_STORAGE_MAX_BYTES } from '../domain/storedFile'
import { validateServerAttachment } from './attachmentValidation.js'
import { readTextSnapshot } from './textSnapshot.js'

const tables = [
  ['metadata', 'legacy_metadata', "'id',id,'value',value"],
  ['photos', 'photos', "'id',id,'fileId',file_id,'date',date,'title',title,'note',note,'width',width,'height',height"],
  ['documents', 'documents', "'id',id,'fileId',file_id,'date',date,'title',title,'kind',kind,'note',note"],
  ['labResults', 'lab_results', `'id',id,'documentId',document_id,'date',date,'name',name,'unit',unit,'reference',reference,'note',note,
    'value',CASE WHEN value_type='number' THEN jsonb_build_object('type','number','number',value_number,'operator',value_operator)
      ELSE jsonb_build_object('type','text','text',value_text) END`],
] as const

export async function readFullSnapshot(client: PoolClient, today: string, exportedAt: string) {
  const text = await readTextSnapshot(client, today, exportedAt)
  const values: Record<string, unknown[]> = {}
  for (const [key, table, fields] of tables) {
    const result = await client.query<Record<string, unknown>>(`SELECT jsonb_build_object(${fields}) AS value FROM health.${table}
      ORDER BY id LIMIT $1`, [BACKUP_MAX_RECORDS + 1])
    values[key] = result.rows.map(row => row['value'])
  }
  const settings = await client.query<Record<string, unknown>>(`SELECT jsonb_build_object('id','section-visibility',
    'value',jsonb_build_object('version',1,'showPhotos',show_photos,'showDocuments',show_documents)::text) AS value
    FROM health.settings WHERE visibility_defined
    UNION ALL SELECT jsonb_build_object('id','catalog-seeded','value','done') FROM health.settings WHERE catalog_seeded`)
  values['metadata'] = [...(values['metadata'] ?? []), ...settings.rows.map(row => row['value'])]
  const photos = new Map(z.array(photoSchema).max(BACKUP_MAX_RECORDS).parse(values['photos']).map(photo => [photo.fileId, photo]))
  const totals = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count,coalesce(sum(size),0)::text AS size FROM health.files')
  z.object({ count: z.coerce.number().max(BACKUP_MAX_RECORDS), size: z.coerce.number().max(FILE_STORAGE_MAX_BYTES) }).parse(totals.rows[0])
  const rows = await client.query<Record<string, unknown>>('SELECT id,purpose,mime,size,bytes FROM health.files ORDER BY id')
  const files: BackupFile[] = []
  for (const input of rows.rows) {
    const row = z.object({ id: entityId, purpose: attachmentPurposeSchema, mime: z.enum(attachmentMimes), size: z.number().int().positive(),
      bytes: z.custom<Buffer>((value: unknown) => Buffer.isBuffer(value)),
    }).parse(input)
    let file: Awaited<ReturnType<typeof validateServerAttachment>>
    try { file = await validateServerAttachment(row.bytes, row.purpose, row.mime) }
    catch { throw new Error('Повреждён сохранённый файл') }
    if (file.size !== row.size) throw new Error('Размер файла не совпадает')
    const photo = photos.get(row.id)
    if (row.purpose === 'photo' && (!photo || !file.dimensions || photo.width !== file.dimensions.width || photo.height !== file.dimensions.height)) throw new Error('Размеры фото не совпадают')
    files.push({ id: row.id, purpose: row.purpose, mime: row.mime, size: row.size, base64: file.bytes.toString('base64') })
  }
  return readFullBackup({ format: 'health-diary-full', version: 1, text, ...values, files }, today)
}

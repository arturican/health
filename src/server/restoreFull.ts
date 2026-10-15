import type { PoolClient } from 'pg'
import { DEFAULT_VISIBILITY, readVisibilityValue, VISIBILITY_SETTING_ID } from '../domain/visibility'
import { importRows } from './importRows.js'
import type { prepareFullImport } from './prepareFullImport.js'
import { replaceTextSnapshot } from './restoreText.js'
import { DataError } from './httpErrors.js'

export async function replaceFullSnapshot(client: PoolClient, owner: string, prepared: Awaited<ReturnType<typeof prepareFullImport>>) {
  const { backup, files } = prepared
  await client.query('DELETE FROM health.files')
  await client.query('DELETE FROM health.legacy_metadata')
  const result = await replaceTextSnapshot(client, owner, backup.text)
  await importRows(client, owner, 'files', ['id', 'purpose', 'mime', 'size', 'bytes'],
    files.map(({ id, file }) => [id, file.purpose, file.mime, file.size, file.bytes]))
  await importRows(client, owner, 'photos', ['id', 'file_id', 'date', 'title', 'note', 'width', 'height'],
    backup.photos.map(row => [row.id, row.fileId, row.date, row.title, row.note, row.width, row.height]))
  await importRows(client, owner, 'documents', ['id', 'file_id', 'date', 'title', 'kind', 'note'],
    backup.documents.map(row => [row.id, row.fileId, row.date, row.title, row.kind, row.note]))
  await importRows(client, owner, 'lab_results', ['id', 'document_id', 'date', 'name', 'value_type', 'value_number', 'value_operator', 'value_text', 'unit', 'reference', 'note'],
    backup.labResults.map(row => [row.id, row.documentId, row.date, row.name, row.value.type,
      row.value.type === 'number' ? row.value.number : null, row.value.type === 'number' ? row.value.operator : null,
      row.value.type === 'text' ? row.value.text : null, row.unit, row.reference, row.note]))
  const visibility = backup.metadata.find(row => row.id === VISIBILITY_SETTING_ID)
  const flags = visibility ? readVisibilityValue(visibility.value) : DEFAULT_VISIBILITY
  const catalogSeeded = backup.metadata.some(row => row.id === 'catalog-seeded')
  const settings = await client.query(`UPDATE health.settings SET show_photos=$1,show_documents=$2,visibility_defined=$3,
    catalog_seeded=$4,revision=revision+1,updated_at=now() WHERE revision<9007199254740991`,
  [flags.showPhotos, flags.showDocuments, visibility !== undefined, catalogSeeded])
  if (settings.rowCount !== 1) throw new DataError(409)
  const legacy = backup.metadata.filter(row => ![VISIBILITY_SETTING_ID, 'catalog-seeded', 'diary-generation'].includes(row.id))
  await importRows(client, owner, 'legacy_metadata', ['id', 'value'], legacy.map(row => [row.id, row.value]))
  return result
}

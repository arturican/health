import { z } from 'zod'
import { readTextBackup, textBackupSchema, BACKUP_MAX_RECORDS } from './backup'
import { PHOTO_MAX_BYTES, DOCUMENT_MAX_BYTES, attachmentMimes } from './attachment'
import { FILE_STORAGE_MAX_BYTES } from './storedFile'
import { readPhoto, photoSchema } from './photo'
import { readDocument, documentSchema } from './document'
import { readLabResult, labResultSchema } from './labResult'
import { entityId, validate } from './schema'
import { isCanonicalBase64 } from './base64'

export const FULL_BACKUP_MAX_BYTES = 200 * 1024 * 1024
export const backupFileSchema = z.strictObject({
  id: entityId, purpose: z.enum(['photo', 'document']), mime: z.enum(attachmentMimes),
  size: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
  base64: z.string().max(4 * Math.ceil(DOCUMENT_MAX_BYTES / 3)),
})
const metadataSchema = z.strictObject({ id: z.string().min(1).max(80), value: z.string().max(20480) })
export const fullBackupSchema = z.strictObject({
  format: z.literal('health-diary-full'), version: z.literal(1), text: textBackupSchema,
  metadata: z.array(metadataSchema).max(BACKUP_MAX_RECORDS),
  photos: z.array(photoSchema).max(BACKUP_MAX_RECORDS),
  documents: z.array(documentSchema).max(BACKUP_MAX_RECORDS),
  labResults: z.array(labResultSchema).max(BACKUP_MAX_RECORDS),
  files: z.array(backupFileSchema).max(BACKUP_MAX_RECORDS),
})
export type FullBackup = z.infer<typeof fullBackupSchema>
export type BackupFile = z.infer<typeof backupFileSchema>

function unique(ids: readonly string[]) {
  if (new Set(ids).size !== ids.length) throw new Error('Повторяющиеся идентификаторы полной копии')
}
export function readFullBackup(input: unknown): FullBackup {
  const backup = validate(fullBackupSchema, input)
  readTextBackup(backup.text)
  backup.photos.forEach(readPhoto)
  backup.documents.forEach(readDocument)
  backup.labResults.forEach(readLabResult)
  for (const records of [backup.metadata, backup.photos, backup.documents, backup.labResults, backup.files]) unique(records.map(record => record.id))
  if (backup.metadata.some(row => row.id === 'catalog-seeded' && row.value !== 'done')) throw new Error('Некорректная отметка каталога')
  const files = new Map(backup.files.map(file => [file.id, file]))
  const owners = [...backup.photos, ...backup.documents].map(record => record.fileId)
  unique(owners)
  if (owners.length !== files.size || owners.some(id => !files.has(id))) throw new Error('Нарушены связи файлов полной копии')
  for (const photo of backup.photos) if (files.get(photo.fileId)?.purpose !== 'photo') throw new Error('Файл фотографии имеет неверное назначение')
  for (const document of backup.documents) if (files.get(document.fileId)?.purpose !== 'document') throw new Error('Файл документа имеет неверное назначение')
  const documents = new Set(backup.documents.map(document => document.id))
  if (backup.labResults.some(result => !documents.has(result.documentId))) throw new Error('Отсутствует документ-источник показателя')
  let total = 0
  for (const file of backup.files) {
    if (file.purpose === 'photo' && (file.mime !== 'image/jpeg' || file.size > PHOTO_MAX_BYTES)) throw new Error('Некорректный формат подготовленного фото')
    if (!isCanonicalBase64(file.base64, file.size)) throw new Error('Некорректные данные Base64 файла')
    total += file.size
  }
  if (total > FILE_STORAGE_MAX_BYTES) throw new Error('Вложения копии превышают 100 MiB')
  return backup
}
export function serializeFullBackup(input: unknown): string {
  const text = JSON.stringify(readFullBackup(input))
  if (new TextEncoder().encode(text).byteLength > FULL_BACKUP_MAX_BYTES) throw new Error('Полная копия превышает 200 MiB')
  return text
}

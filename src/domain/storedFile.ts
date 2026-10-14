import { z } from 'zod'
import { attachmentMimes, attachmentPurposeSchema, DOCUMENT_MAX_BYTES, PHOTO_MAX_BYTES } from './attachment'
import { entityId, validate } from './schema'

export const FILE_STORAGE_MAX_BYTES = 100 * 1024 * 1024
export const storedFileSchema = z.strictObject({
  id: entityId,
  purpose: attachmentPurposeSchema,
  mime: z.enum(attachmentMimes),
  size: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
  blob: z.custom<Blob>((value: unknown) => value instanceof Blob, 'Некорректные байты вложения'),
})
export type StoredFile = z.infer<typeof storedFileSchema>

export function readStoredFile(input: unknown): StoredFile {
  const file = validate(storedFileSchema, input)
  if (file.blob.size !== file.size || file.blob.type !== file.mime) throw new Error('Метаданные вложения не совпадают с файлом')
  if (file.purpose === 'photo' && (file.mime === 'application/pdf' || file.size > PHOTO_MAX_BYTES)) throw new Error('Некорректный файл фотографии')
  return file
}

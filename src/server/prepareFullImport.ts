import { readFullBackup } from '../domain/fullBackup'
import { validateServerAttachment } from './attachmentValidation.js'
import { DataError, inputValue } from './httpErrors.js'

export async function prepareFullImport(input: unknown, today: string) {
  const backup = inputValue(() => readFullBackup(input, today))
  const photos = new Map(backup.photos.map(photo => [photo.fileId, photo]))
  const files: { id: string, file: Awaited<ReturnType<typeof validateServerAttachment>> }[] = []
  for (const record of backup.files) {
    const file = await validateServerAttachment(Buffer.from(record.base64, 'base64'), record.purpose, record.mime)
    if (file.size !== record.size) throw new DataError(400)
    const photo = photos.get(record.id)
    if (record.purpose === 'photo' && (!photo || !file.dimensions || photo.width !== file.dimensions.width || photo.height !== file.dimensions.height)) throw new DataError(400)
    files.push({ id: record.id, file })
  }
  return { backup, files }
}

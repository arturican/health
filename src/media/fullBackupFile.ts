import { FULL_BACKUP_MAX_BYTES, readFullBackup, type FullBackup } from '../domain/fullBackup'
import { decodeBase64 } from '../domain/base64'
import { type StoredFile } from '../domain/storedFile'
import { checkBackupFile } from './checkBackupFile'

export async function prepareFullBackup(input: unknown): Promise<{ backup: FullBackup; files: StoredFile[] }> {
  const backup = readFullBackup(input)
  const photos = new Map(backup.photos.map(photo => [photo.fileId, photo]))
  const files: StoredFile[] = []
  for (const encoded of backup.files) {
    const { base64, ...metadata } = encoded
    const bytes = new Uint8Array(decodeBase64(base64, metadata.size))
    const file: StoredFile = { ...metadata, blob: new Blob([bytes], { type: metadata.mime }) }
    await checkBackupFile(file, photos.get(file.id))
    files.push(file)
  }
  return { backup, files }
}

export async function readFullBackupFile(input: unknown): Promise<FullBackup> {
  if (!(input instanceof File)) throw new Error('Выберите файл полной копии')
  if (input.size === 0) throw new Error('Файл пуст')
  if (input.size > FULL_BACKUP_MAX_BYTES) throw new Error('Полная копия превышает 200 MiB')
  let parsed: unknown
  try {
    const bytes = await input.arrayBuffer()
    if (bytes.byteLength !== input.size) throw new Error('Размер файла изменился')
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { throw new Error('Не удалось прочитать JSON в кодировке UTF-8') }
  return (await prepareFullBackup(parsed)).backup
}

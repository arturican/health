import { readTextBackup, TEXT_BACKUP_MAX_BYTES, type TextBackup } from '../domain/backup'

export async function readBackupFile(file: File): Promise<TextBackup> {
  if (file.size === 0) throw new Error('Файл пуст')
  if (file.size > TEXT_BACKUP_MAX_BYTES) throw new Error('Текстовая копия превышает 20 MiB')
  let input: unknown
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    input = JSON.parse(text)
  } catch {
    throw new Error('Не удалось прочитать JSON в кодировке UTF-8')
  }
  return readTextBackup(input)
}

import { db, type DiaryDatabase } from './db'
import { checkAttachment } from '../domain/attachment'
import { FILE_STORAGE_MAX_BYTES, readStoredFile, type StoredFile } from '../domain/storedFile'
import { entityId, validate } from '../domain/schema'
import { assertRecordCapacity } from './recordLimit'

export async function prepareFile(input: unknown, purposeInput: unknown): Promise<StoredFile> {
  const checked = await checkAttachment(input, purposeInput)
  return readStoredFile({ ...checked, id: crypto.randomUUID(), purpose: purposeInput })
}

/** Bytes are checked by prepareFile before the caller opens its transaction. */
export async function savePreparedFile(input: StoredFile, database: DiaryDatabase = db): Promise<void> {
  const file = readStoredFile(input)
  await database.transaction('rw', database.files, async () => {
    assertRecordCapacity(await database.files.count())
    const records: unknown[] = await database.files.toArray()
    const total = records.map(readStoredFile).reduce((sum, record) => sum + record.size, 0)
    if (total + file.size > FILE_STORAGE_MAX_BYTES) throw new Error('Вложения превышают общий предел 100 MiB; удалите ненужные файлы')
    await database.files.add(file)
  })
}

export async function getFile(idInput: unknown, database: DiaryDatabase = db): Promise<StoredFile | null> {
  const id = validate(entityId, idInput)
  const value: unknown = await database.files.get(id)
  if (value === undefined) return null
  const file = readStoredFile(value)
  await checkAttachment(file.blob, file.purpose)
  return file
}

import { db, type DiaryDatabase } from './db'
import { exportTextBackup } from './backupRepository'
import { readFullBackup, type BackupFile, type FullBackup } from '../domain/fullBackup'
import { readStoredFile } from '../domain/storedFile'
import { readPhoto } from '../domain/photo'
import { encodeBase64 } from '../domain/base64'
import { checkBackupFile } from '../media/checkBackupFile'

export async function exportFullBackup(database: DiaryDatabase = db): Promise<FullBackup> {
  const snapshot = await database.transaction('r', database.tables, async () => ({
    text: await exportTextBackup(database),
    metadata: await database.metadata.toArray(),
    photos: await database.photos.toArray(),
    documents: await database.documents.toArray(),
    labResults: await database.labResults.toArray(),
    files: await database.files.toArray(),
  }))
  const photos = new Map(snapshot.photos.map(readPhoto).map(photo => [photo.fileId, photo]))
  const files: BackupFile[] = []
  for (const record of snapshot.files) {
    const file = readStoredFile(record)
    const bytes = await checkBackupFile(file, photos.get(file.id))
    files.push({ id: file.id, purpose: file.purpose, mime: file.mime, size: file.size, base64: encodeBase64(bytes) })
  }
  return readFullBackup({ format: 'health-diary-full', version: 1, ...snapshot, files })
}

import { db, type DiaryDatabase } from './db'
import { readPhoto, readPhotoInput, type Photo } from '../domain/photo'
import { preparePhoto } from '../media/preparePhoto'
import { prepareFile, savePreparedFile } from './fileRepository'

export async function listPhotos(database: DiaryDatabase = db): Promise<Photo[]> {
  const records: unknown[] = await database.photos.toArray()
  return records.map(readPhoto).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

export async function addPhoto(input: unknown, fileInput: unknown, database: DiaryDatabase = db): Promise<Photo> {
  const values = readPhotoInput(input)
  const prepared = await preparePhoto(fileInput)
  const file = await prepareFile(prepared.blob, 'photo')
  const photo = readPhoto({ ...values, id: crypto.randomUUID(), fileId: file.id, width: prepared.width, height: prepared.height })
  await database.transaction('rw', database.photos, database.files, async () => {
    await savePreparedFile(file, database)
    await database.photos.add(photo)
  })
  return photo
}

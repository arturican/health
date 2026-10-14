import { db, type DiaryDatabase } from './db'
import { readPhoto, readPhotoInput, type Photo } from '../domain/photo'
import { preparePhoto } from '../media/preparePhoto'
import { prepareFile, savePreparedFile } from './fileRepository'
import { entityId, validate } from '../domain/schema'

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

export async function updatePhoto(idInput: unknown, input: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  const values = readPhotoInput(input)
  await database.transaction('rw', database.photos, async () => {
    const old: unknown = await database.photos.get(id)
    if (old === undefined) throw new Error('Фотография не найдена')
    await database.photos.put(readPhoto({ ...readPhoto(old), ...values }))
  })
}

export async function deletePhoto(idInput: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  await database.transaction('rw', database.photos, database.files, async () => {
    const value: unknown = await database.photos.get(id)
    if (value === undefined) throw new Error('Фотография не найдена')
    const photo = readPhoto(value)
    await database.photos.delete(photo.id)
    await database.files.delete(photo.fileId)
  })
}

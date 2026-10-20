import { notifyFileDeleted } from './fileRepository'
import { photoSchema, readPhotoInput, type Photo } from '../domain/photo'
import { preparePhoto } from '../media/preparePhoto'
import { prepareFile } from '../media/prepareFile'
import { readPages } from './pages'
import { deleteRecord, mutateJSON } from './mutations'
import { assertContext, captureContext, recordRevision, recordSchema } from './records'
import { uploadRecord } from './upload'

const schema = recordSchema(photoSchema)
export async function listPhotos() {
  return (await readPages('/api/v1/photos', schema)).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export async function addPhoto(input: unknown, fileInput: unknown) {
  const context = captureContext(), metadata = readPhotoInput(input)
  const prepared = await preparePhoto(fileInput)
  const file = await prepareFile(prepared.blob, 'photo')
  return uploadRecord('photos', metadata, file, schema, context)
}
export async function updatePhoto(original: Photo, input: unknown) {
  const value = { value: readPhotoInput(input), revision: recordRevision(original) }
  await mutateJSON(`updatePhoto ${original.id}`, value, schema, () => ({ path: `/api/v1/photos/${original.id}`, method: 'PUT', value }))
}
export async function deletePhoto(original: Photo) {
  const context = captureContext()
  await deleteRecord(`/api/v1/photos/${original.id}`, original)
  assertContext(context)
  notifyFileDeleted(original.fileId)
}

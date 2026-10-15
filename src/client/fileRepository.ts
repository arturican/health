import { entityId } from '../domain/schema'
import { checkAttachment } from '../domain/attachment'
import { readStoredFile } from '../domain/storedFile'
import { ApiError, requestApi } from './http'

export async function getFile(idInput: unknown) {
  const id = entityId.parse(idInput)
  try {
    return await requestApi(`/api/v1/files/${id}`, async response => {
      const blob = await response.blob()
      const file = readStoredFile({ id, blob, size: blob.size, mime: blob.type, purpose: response.headers.get('X-File-Purpose') })
      await checkAttachment(blob, file.purpose)
      return file
    })
  } catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error }
}

import { getClientSession } from './session'
import { entityId } from '../domain/schema'
import { checkAttachment } from '../domain/attachment'
import { readStoredFile } from '../domain/storedFile'
import { ApiError, requestApi } from './http'

export async function getFile(idInput: unknown) {
  const id = entityId.parse(idInput), epoch = getClientSession().epoch
  const requestState = { deleted: false }
  const unsubscribe = subscribeFileDeletion(event => { if (event.fileId === id && event.epoch === epoch) requestState.deleted = true })
  try {
    const file = await requestApi(`/api/v1/files/${id}`, async response => {
      const blob = await response.blob()
      const file = readStoredFile({ id, blob, size: blob.size, mime: blob.type, purpose: response.headers.get('X-File-Purpose') })
      await checkAttachment(blob, file.purpose)
      return file
    })
    return requestState.deleted ? null : file
  } catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error }
  finally { unsubscribe() }
}

type FileDeletion = { fileId: string; epoch: number }
const deletionListeners = new Set<(event: FileDeletion) => void>()
export function subscribeFileDeletion(listener: (event: FileDeletion) => void) {
  deletionListeners.add(listener)
  return () => { deletionListeners.delete(listener) }
}
export function notifyFileDeleted(fileId: string) {
  const event = { fileId, epoch: getClientSession().epoch }
  for (const listener of deletionListeners) listener(event)
}

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getFile } from '../dataAccess'
import { getClientSession, subscribeSession } from '../client/session'

type FileValue = Awaited<ReturnType<typeof getFile>>
type Slot = { identity: string; active: boolean; file: FileValue; pending: Promise<FileValue> | null }
function fileIdentity(id: string) {
  const { session, diary, epoch } = getClientSession()
  return JSON.stringify([session?.account.id, diary?.generation, epoch, id])
}

/** Immutable bytes только на время жизни viewer; URLs принадлежат renderer. */
export function useFileReader(fileId: string, load = () => getFile(fileId)) {
  const identity = useSyncExternalStore(subscribeSession, () => fileIdentity(fileId))
  const cache = useRef<Slot | null>(null)
  useEffect(() => {
    const slot: Slot = { identity, active: true, file: null, pending: null }
    cache.current = slot
    return () => { slot.active = false; slot.file = null; slot.pending = null }
  }, [identity])
  async function readFile() {
    const slot = cache.current
    if (!slot?.active || slot.identity !== identity || fileIdentity(fileId) !== identity) throw new Error('Файл относится к прежнему просмотру.')
    if (slot.file) return slot.file
    slot.pending ??= (async () => {
      const file = await load()
      if (!slot.active || fileIdentity(fileId) !== identity) throw new Error('Файл относится к прежнему просмотру.')
      if (file) slot.file = file
      return file
    })().finally(() => { slot.pending = null })
    return slot.pending
  }
  return { identity, readFile }
}

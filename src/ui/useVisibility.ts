import { useState, useSyncExternalStore } from 'react'
import { useDiaryQueryState, getVisibility } from '../dataAccess'
import { getClientSession, subscribeSession } from '../client/session'
import { type Visibility } from '../domain/visibility'

const hidden: Visibility = { version: 1, showPhotos: false, showDocuments: false }
const getEpoch = () => getClientSession().epoch
type Read = { value: Visibility; failed: boolean; epoch: number }

export function useVisibility() {
  const [attempt, setAttempt] = useState(0)
  const epoch = useSyncExternalStore(subscribeSession, getEpoch)
  const [lastKnown, setLastKnown] = useState<Read>()
  const { data: result, current } = useDiaryQueryState(async () => {
    try { return { value: await getVisibility(), failed: false, epoch } }
    catch { return { value: hidden, failed: true, epoch } }
  }, [attempt, epoch])
  const accepted = result?.epoch === epoch ? result : undefined
  if (accepted && !accepted.failed && accepted !== lastKnown) setLastKnown(accepted)
  const known = lastKnown?.epoch === epoch ? lastKnown.value : undefined
  const value = accepted && !accepted.failed ? accepted.value : known ?? accepted?.value
  return value && {
    value, known: known !== undefined || accepted?.failed === false,
    failed: accepted?.failed ?? false, current: current && accepted?.failed === false,
    retry: () => { setAttempt(count => count + 1) },
  }
}

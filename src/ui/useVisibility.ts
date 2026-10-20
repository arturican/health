import { useState } from 'react'
import { useDiaryQueryState, getVisibility } from '../dataAccess'
import { type Visibility } from '../domain/visibility'

const hidden: Visibility = { version: 1, showPhotos: false, showDocuments: false }
export function useVisibility() {
  const [attempt, setAttempt] = useState(0)
  const { data: result, current } = useDiaryQueryState(async () => {
    try { return { value: await getVisibility(), failed: false } }
    catch { return { value: hidden, failed: true } }
  }, [attempt])
  return result && { ...result, current, retry: () => { setAttempt(value => value + 1) } }
}

import { useLiveQuery } from 'dexie-react-hooks'
import { getVisibility } from '../data/visibilityRepository'
import { type Visibility } from '../domain/visibility'

const hidden: Visibility = { version: 1, showPhotos: false, showDocuments: false }
export function useVisibility() {
  return useLiveQuery(async () => {
    try { return { value: await getVisibility(), failed: false } }
    catch { return { value: hidden, failed: true } }
  })
}

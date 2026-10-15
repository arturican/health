import { visibilitySchema, type Visibility } from '../domain/visibility'
import { mutateJSON } from './mutations'
import { refreshDiaryState } from './readState'
import { assertContext, captureContext, recordRevision, recordSchema } from './records'
import { diaryStateSchema, updateDiaryState } from './session'

export async function getVisibility() {
  const context = captureContext(), state = await refreshDiaryState()
  assertContext(context)
  return recordSchema(visibilitySchema).parse({ value: state.value, revision: state.revision })
}
export async function saveVisibility(input: unknown, original: Visibility) {
  const value = { value: visibilitySchema.parse(input), revision: recordRevision(original) }
  const schema = diaryStateSchema.transform(state => { updateDiaryState(state); return null })
  await mutateJSON('saveVisibility', value, schema, () => ({ path: '/api/v1/settings', method: 'PUT', value }))
}

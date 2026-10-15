import { ApiError, requestJSON } from './http'
import { assertContext, captureContext } from './records'
import { diaryStateSchema, updateDiaryState } from './session'

export async function refreshDiaryState() {
  const context = captureContext()
  const state = await requestJSON('/api/v1/diary-state', diaryStateSchema)
  assertContext(context)
  updateDiaryState(state)
  return state
}

export async function consistentRead<T>(work: () => Promise<T>): Promise<T> {
  const context = captureContext()
  for (let attempt = 0; attempt < 3; attempt++) {
    assertContext(context)
    const before = await refreshDiaryState()
    assertContext(context)
    const value = await work()
    assertContext(context)
    const after = await refreshDiaryState()
    assertContext(context)
    if (before.changeRevision === after.changeRevision) return value
  }
  throw new ApiError(409)
}

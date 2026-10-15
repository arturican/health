import { assertContext, captureContext } from './records'
import { refreshDiaryState } from './readState'

export type DiaryConfirmation = Readonly<{ context: ReturnType<typeof captureContext>, changeRevision: number }>
export async function prepareDiaryChange(): Promise<DiaryConfirmation> {
  const context = captureContext()
  const state = await refreshDiaryState()
  assertContext(context)
  return Object.freeze({ context, changeRevision: state.changeRevision })
}

import { sessionSchema, type Session } from '../domain/session'
import { z } from 'zod'
import { visibilitySchema } from '../domain/visibility'
import { configureCalendarTimezone } from '../domain/input'

export const diaryStateSchema = z.strictObject({ generation: z.uuid(), value: visibilitySchema,
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), changeRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), catalogSeeded: z.boolean() })
export type DiaryState = z.infer<typeof diaryStateSchema>
let state: Readonly<{ session: Session | null, diary: DiaryState | null, epoch: number }> = { session: null, diary: null, epoch: 0 }
const listeners = new Set<() => void>()
const requests = new Set<AbortController>()

export const getClientSession = () => state
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setClientSession(input: unknown, diaryInput: unknown = null) {
  const session = input === null ? null : sessionSchema.parse(input)
  const diary = diaryInput === null ? null : diaryStateSchema.parse(diaryInput)
  if (!session && diary) throw new Error('Состояние дневника требует сессии')
  if (session) { Object.freeze(session.account); Object.freeze(session) }
  if (diary) { Object.freeze(diary.value); Object.freeze(diary) }
  configureCalendarTimezone(session?.account.timezone ?? null)
  state = Object.freeze({ session, diary, epoch: state.epoch + 1 })
  for (const controller of requests) controller.abort()
  requests.clear()
  for (const listener of listeners) listener()
}

export function beginRequest() {
  const epoch = state.epoch, controller = new AbortController()
  requests.add(controller)
  return {
    controller,
    assertCurrent() { if (state.epoch !== epoch) throw new Error('Запрос относится к прежнему входу. Повторите действие.') },
    finish() { requests.delete(controller) },
  }
}

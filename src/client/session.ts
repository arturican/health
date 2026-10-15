import { sessionSchema, type Session } from '../domain/session'

let state: Readonly<{ session: Session | null, epoch: number }> = { session: null, epoch: 0 }
const listeners = new Set<() => void>()
const requests = new Set<AbortController>()

export const getClientSession = () => state
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setClientSession(input: unknown) {
  const session = input === null ? null : sessionSchema.parse(input)
  if (session) { Object.freeze(session.account); Object.freeze(session) }
  state = Object.freeze({ session, epoch: state.epoch + 1 })
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

let revision = 0
const listeners = new Set<() => void>()
const errors = new Set<symbol>()
const errorListeners = new Set<() => void>()

export const getQueryRevision = () => revision
export const getQueryErrorCount = () => errors.size
export function subscribeQueries(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function subscribeQueryErrors(listener: () => void) {
  errorListeners.add(listener)
  return () => { errorListeners.delete(listener) }
}
export function invalidateQueries() {
  revision++
  for (const listener of listeners) listener()
}
export function reportQueryError(token: symbol, failed: boolean) {
  const previous = errors.size
  if (failed) errors.add(token)
  else errors.delete(token)
  if (previous !== errors.size) for (const listener of errorListeners) listener()
}

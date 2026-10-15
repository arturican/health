import { getClientSession, subscribeSession } from './session'

let notice: string | null = null, epoch = getClientSession().epoch
const listeners = new Set<() => void>()
export const getNotice = () => notice
export function subscribeNotices(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function setNotice(value: string | null) { notice = value; for (const listener of listeners) listener() }
subscribeSession(() => {
  if (getClientSession().epoch !== epoch) { epoch = getClientSession().epoch; setNotice(null) }
})

import { getClientSession, subscribeSession } from './session'

let notice: string | null = null
let previous = getClientSession()
const listeners = new Set<() => void>()
export const getNotice = () => notice
export function subscribeNotices(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function setNotice(value: string | null) { notice = value; for (const listener of listeners) listener() }
subscribeSession(() => {
  const current = getClientSession()
  const changedEpoch = current.epoch !== previous.epoch
  const changedDiary = previous.session !== null && current.session?.account.id === previous.session.account.id
    && previous.diary !== null && current.diary !== null && previous.diary.generation !== current.diary.generation
  previous = current
  if (changedEpoch) setNotice(changedDiary
    ? 'Дневник обновлён. Несохранённый ввод сброшен; проверьте записи перед повторным действием.'
    : null)
})

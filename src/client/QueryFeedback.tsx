import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getQueryErrorCount, invalidateQueries, subscribeQueryErrors } from './queries'
import { getNotice, setNotice, subscribeNotices } from './notices'

export function QueryFeedback() {
  const errors = useSyncExternalStore(subscribeQueryErrors, getQueryErrorCount)
  const notice = useSyncExternalStore(subscribeNotices, getNotice)
  const feedback = useRef<HTMLElement>(null)
  useEffect(() => {
    if (notice && document.activeElement === document.body) feedback.current?.focus()
  }, [notice])
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') invalidateQueries() }
    window.addEventListener('focus', invalidateQueries)
    window.addEventListener('online', invalidateQueries)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('focus', invalidateQueries)
      window.removeEventListener('online', invalidateQueries)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  if (!errors && !notice) return null
  return <aside ref={feedback} tabIndex={-1} className="card" aria-label="Обновление данных">
    {notice && <><p role="status">{notice}</p><button type="button" onClick={() => { setNotice(null); document.querySelector<HTMLElement>('main')?.focus() }}>Закрыть сообщение</button></>}
    {errors > 0 && <>
    <p role="alert">Не удалось обновить данные. На экране остаются прежние значения; ваш ввод сохранён.</p>
    <button type="button" onClick={invalidateQueries}>Повторить загрузку</button>
    </>}
  </aside>
}

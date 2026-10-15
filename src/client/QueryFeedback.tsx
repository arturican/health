import { useEffect, useSyncExternalStore } from 'react'
import { getQueryErrorCount, invalidateQueries, subscribeQueryErrors } from './queries'

export function QueryFeedback() {
  const errors = useSyncExternalStore(subscribeQueryErrors, getQueryErrorCount)
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
  if (!errors) return null
  return <aside className="card" aria-label="Обновление данных">
    <p role="alert">Не удалось обновить данные. На экране остаются прежние значения; ваш ввод сохранён.</p>
    <button type="button" onClick={invalidateQueries}>Повторить загрузку</button>
  </aside>
}

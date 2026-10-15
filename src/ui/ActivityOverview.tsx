import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { listWorkouts } from '../data/workoutRepository'
import { activityDates, activityOverview } from '../domain/activityOverview'
import { useDay } from './DayContext'
import { Icon } from './Icon'

export function ActivityOverview() {
  const { day } = useDay()
  const result = useLiveQuery(() => db.transaction('r', db.steps, db.workouts, async () => {
    const dates = activityDates(day)
    return { day, value: activityOverview(day, await db.steps.where('date').between(dates[0] ?? day, day, true, true).toArray(), await listWorkouts(day)) }
  }), [day])
  const data = result?.day === day ? result.value : undefined
  if (!data) return <p role="status">Загружаем сводку активности…</p>
  return <>
    <div className="activity-metrics">
      <section className="card"><Icon name="activity" /><h2>Шаги за выбранный день</h2><strong>{data.steps === null ? 'Нет данных' : data.steps.toLocaleString('ru-RU')}</strong><p>Сохранённый итог дня</p></section>
      <section className="card"><Icon name="activity" /><h2>Записано тренировок</h2><strong>{data.count}</strong><p>Количество записей в дневнике</p></section>
      <section className="card"><Icon name="activity" /><h2>Время тренировок</h2><strong>{data.minutes === null ? 'Нет данных' : `${data.minutes.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} мин`}</strong><p>По записанной длительности</p></section>
    </div>
    <section className="card activity-week" aria-label="Шаги за семь дней">
      <h2>Шаги за семь дней</h2>
      <p>До {day.split('-').reverse().join('.')} включительно</p>
      <ol className="step-bars">{data.days.map(entry => <li key={entry.date}>
        <strong>{entry.count === null ? '—' : entry.count.toLocaleString('ru-RU')}</strong>
        <div className="step-track" aria-hidden="true">{entry.count !== null && <span style={{ height: `${String(entry.count / data.maximum * 100)}%` }} />}</div>
        <time dateTime={entry.date}>{entry.date.slice(5).split('-').reverse().join('.')}</time>
        {entry.count === null && <span className="step-missing">Нет записи</span>}
      </li>)}</ol>
      <p>Шкала от 0 до {data.maximum.toLocaleString('ru-RU')} шагов. Пропуск не означает нулевую активность.</p>
    </section>
  </>
}

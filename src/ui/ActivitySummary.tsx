import { useId } from 'react'
import { useDiaryQuery, getActivitySummary } from '../dataAccess'
import { useDay } from './DayContext'
import { Icon } from './Icon'

export function ActivitySummary() {
  const title = useId()
  const { day } = useDay()
  const result = useDiaryQuery(() => getActivitySummary(day), [day])
  const data = result?.day === day ? result : undefined
  return <section className="card activity-summary" aria-labelledby={title}>
    <h2 id={title}><Icon name="activity" /> Активность за день</h2>
    {!data ? <p role="status">Загружаем активность…</p> : <>
      <p>Шаги: {data.steps === null ? 'нет данных' : data.steps.count.toLocaleString('ru-RU')}.</p>
      {data.workouts.length === 0 ? <p>Тренировки не записаны.</p> : <ul className="record-list" aria-label="Сводка тренировок">
        {data.workouts.map(workout => <li key={workout.id}><strong>{workout.kind}</strong><span>{String(workout.minutes).replace('.', ',')} мин; ручная оценка: {workout.kcal === null ? 'нет данных' : `${String(workout.kcal).replace('.', ',')} ккал`}</span></li>)}
      </ul>}
    </>}
    <p>Отсутствие записей не означает отсутствие активности.</p>
    <a href="#activity">Записать шаги или тренировку</a>
  </section>
}

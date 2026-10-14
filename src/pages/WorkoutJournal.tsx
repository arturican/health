import { useLiveQuery } from 'dexie-react-hooks'
import { listWorkouts } from '../data/workoutRepository'
import { useDay } from '../ui/DayContext'
import { WorkoutForm } from './WorkoutForm'

export function WorkoutJournal() {
  const { day } = useDay()
  const workouts = useLiveQuery(() => listWorkouts(day), [day])
  return <section className="card" aria-labelledby="workouts-title">
    <h2 id="workouts-title">Тренировки</h2>
    <WorkoutForm />
    {workouts === undefined ? <p role="status">Загружаем тренировки…</p> : workouts.length === 0 ? <p>За этот день нет записей тренировок.</p> : <ul className="record-list" aria-label="Тренировки выбранного дня">
      {workouts.map(workout => <li key={workout.id}>
        <strong>{workout.kind}</strong>
        <p>{workout.minutes.toLocaleString('ru-RU')} мин. {workout.kcal === null ? 'Расход: нет данных' : `Ручная оценка: ${workout.kcal.toLocaleString('ru-RU')} ккал`}</p>
        {workout.source && <p>Источник: {workout.source}</p>}
        {workout.note && <p>{workout.note}</p>}
      </li>)}
    </ul>}
  </section>
}

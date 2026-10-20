import { useEffect, useRef, useState } from 'react'
import { useDiaryQuery, deleteWorkout, listWorkouts } from '../dataAccess'
import type { Workout } from '../domain/activity'
import { useDay } from '../ui/DayContext'
import { WorkoutForm } from './WorkoutForm'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'
import { exactNumber } from '../ui/exactNumber'

export function WorkoutJournal() {
  const { day } = useDay()
  const workouts = useDiaryQuery(() => listWorkouts(day), [day])
  const [editing, setEditing] = useState<Workout | null>(null)
  const [deleting, setDeleting] = useState<Workout | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formPending, setFormPending] = useState(false)
  const action = useAction()
  const busy = action.pending || formPending
  const formProps = { disabled: action.pending, onPendingChange: setFormPending }
  const section = useRef<HTMLElement>(null)
  const focusAfterChange = useRef(false)
  useEffect(() => {
    if (focusAfterChange.current && !editing && !action.pending) {
      focusAfterChange.current = false
      section.current?.querySelector<HTMLInputElement>('[name="kind"]')?.focus()
    }
  }, [editing, deleting, action.pending, workouts])
  return <section ref={section} className="card workout-journal" aria-labelledby="workouts-title">
    <h2 id="workouts-title">Тренировки</h2>
    {editing ? <WorkoutForm {...formProps} key={editing.id} entry={editing} onSaved={() => {
      focusAfterChange.current = true
      setEditing(null)
      setNotice('Тренировка обновлена')
    }} onCancel={() => { focusAfterChange.current = true; setEditing(null) }} /> : <WorkoutForm {...formProps} onSaved={() => { setNotice(null); action.reset() }} />}
    {notice && <p role="status">{notice}</p>}
    <Feedback error={action.error} message={action.message} />
    {workouts === undefined ? <p role="status">Загружаем тренировки…</p> : workouts.length === 0 ? <p>За этот день нет записей тренировок.</p> : <ul className="record-list" aria-label="Тренировки выбранного дня">
      {workouts.map((workout, index) => <li key={workout.id}>
        <strong>{workout.kind}</strong>
        <p>{exactNumber(workout.minutes)} мин. {workout.kcal === null ? 'Расход: нет данных' : `Ручная оценка: ${exactNumber(workout.kcal)} ккал`}</p>
        {workout.source && <p>Источник: {workout.source}</p>}
        {workout.note && <p>{workout.note}</p>}
        <div className="actions">
          <button type="button" disabled={busy || editing !== null || deleting !== null} aria-label={`Изменить тренировку ${String(index + 1)}: ${workout.kind}`} onClick={() => { action.reset(); setNotice(null); setEditing(workout) }}>Изменить</button>
          <button type="button" disabled={busy || editing !== null || deleting !== null} aria-label={`Удалить тренировку ${String(index + 1)}: ${workout.kind}`} onClick={() => { action.reset(); setNotice(null); setDeleting(workout) }}>Удалить</button>
        </div>
      </li>)}
    </ul>}
    {deleting && <Confirmation question={`Удалить тренировку «${deleting.kind}» за ${deleting.date}?`} pending={busy} onCancel={() => { setDeleting(null) }} onConfirm={() => {
      action.run(async () => {
        await deleteWorkout(deleting)
        focusAfterChange.current = true
        setDeleting(null)
      }, 'Тренировка удалена')
    }} />}
  </section>
}

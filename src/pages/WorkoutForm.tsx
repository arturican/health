import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addWorkout, updateWorkout } from '../dataAccess'
import { workoutInputSchema, type Workout } from '../domain/activity'
import { localDate, parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { useDay } from '../ui/DayContext'
import { Field } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

interface WorkoutFormProps { entry?: Workout; onSaved?: () => void; onCancel?: () => void }

export function WorkoutForm({ entry, onSaved, onCancel }: WorkoutFormProps = {}) {
  const { day } = useDay()
  const action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const focusAfterSave = useRef(false)
  useEffect(() => { formRef.current?.querySelector<HTMLInputElement>('[name="date"]')?.focus() }, [])
  useEffect(() => {
    if (focusAfterSave.current && !action.pending) {
      focusAfterSave.current = false
      formRef.current?.querySelector<HTMLInputElement>('[name="kind"]')?.focus()
    }
  }, [revision, action.pending])
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const date = entry ? readField(form, 'date', text => {
      const value = validate(workoutInputSchema.shape.date, text)
      if (value > localDate()) throw new Error('Дата тренировки не может быть в будущем')
      return value
    }, fieldErrors) : day
    const kind = readField(form, 'kind', text => validate(workoutInputSchema.shape.kind, text), fieldErrors)
    const minutes = readField(form, 'minutes', text => validate(workoutInputSchema.shape.minutes, parseNumber(text)), fieldErrors)
    const kcal = readField(form, 'kcal', text => validate(workoutInputSchema.shape.kcal, parseNumber(text, { optional: true })), fieldErrors)
    const source = readField(form, 'source', text => validate(workoutInputSchema.shape.source, text), fieldErrors)
    const note = readField(form, 'note', text => validate(workoutInputSchema.shape.note, text), fieldErrors)
    setErrors(fieldErrors)
    if (date === null || kind === null || minutes === null || source === null || note === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      const values = { date, kind, minutes, kcal, source, note }
      if (entry) await updateWorkout(entry, values)
      else {
        await addWorkout(values)
        focusAfterSave.current = true
        setRevision(value => value + 1)
      }
      onSaved?.()
    }, entry ? 'Тренировка обновлена' : 'Тренировка добавлена')
  }
  return <>
    <form ref={formRef} key={revision} className="form-grid" aria-label={entry ? 'Редактирование тренировки' : 'Добавление тренировки'} onSubmit={submit} noValidate>
      <fieldset disabled={action.pending}>
        <legend>{entry ? 'Параметры тренировки' : `Тренировка за ${day}`}</legend>
        {entry && <Field label="Дата тренировки" name="date" type="date" required max={localDate()} defaultValue={entry.date} error={errors['date']} />}
        <Field label="Вид тренировки" name="kind" required maxLength={80} defaultValue={entry?.kind ?? ''} error={errors['kind']} />
        <Field label="Длительность, мин" name="minutes" required inputMode="decimal" maxLength={12} defaultValue={entry?.minutes ?? ''} error={errors['minutes']} />
        <Field label="Ручная оценка расхода, ккал (необязательно)" name="kcal" inputMode="decimal" maxLength={12} defaultValue={entry?.kcal ?? ''} error={errors['kcal']} />
        <p>Если расход неизвестен, оставьте поле ккал пустым.</p>
        <Field label="Источник оценки (необязательно)" name="source" maxLength={160} defaultValue={entry?.source ?? ''} error={errors['source']} />
        <Field label="Комментарий к тренировке (необязательно)" name="note" maxLength={500} defaultValue={entry?.note ?? ''} error={errors['note']} />
      </fieldset>
      <div className="actions">
        <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : entry ? 'Сохранить тренировку' : 'Добавить тренировку'}</button>
        {entry && <button type="button" disabled={action.pending} onClick={onCancel}>Отменить правку тренировки</button>}
      </div>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}

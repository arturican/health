import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addWorkout } from '../data/workoutRepository'
import { workoutInputSchema } from '../domain/activity'
import { parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { useDay } from '../ui/DayContext'
import { Field } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

export function WorkoutForm() {
  const { day } = useDay()
  const action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const focusAfterSave = useRef(false)
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
    const kind = readField(form, 'kind', text => validate(workoutInputSchema.shape.kind, text), fieldErrors)
    const minutes = readField(form, 'minutes', text => validate(workoutInputSchema.shape.minutes, parseNumber(text)), fieldErrors)
    const kcal = readField(form, 'kcal', text => validate(workoutInputSchema.shape.kcal, parseNumber(text, { optional: true })), fieldErrors)
    const source = readField(form, 'source', text => validate(workoutInputSchema.shape.source, text), fieldErrors)
    const note = readField(form, 'note', text => validate(workoutInputSchema.shape.note, text), fieldErrors)
    setErrors(fieldErrors)
    if (kind === null || minutes === null || source === null || note === null || Object.keys(fieldErrors).length) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      await addWorkout({ date: day, kind, minutes, kcal, source, note })
      focusAfterSave.current = true
      setRevision(value => value + 1)
    }, 'Тренировка добавлена')
  }
  return <>
    <form ref={formRef} key={revision} className="form-grid" aria-label="Добавление тренировки" onSubmit={submit} noValidate>
      <fieldset disabled={action.pending}>
        <legend>Тренировка за {day}</legend>
        <Field label="Вид тренировки" name="kind" required maxLength={80} error={errors['kind']} />
        <Field label="Длительность, мин" name="minutes" required inputMode="decimal" maxLength={12} error={errors['minutes']} />
        <Field label="Ручная оценка расхода, ккал (необязательно)" name="kcal" inputMode="decimal" maxLength={12} error={errors['kcal']} />
        <p>Если расход неизвестен, оставьте поле ккал пустым.</p>
        <Field label="Источник оценки (необязательно)" name="source" maxLength={160} error={errors['source']} />
        <Field label="Комментарий к тренировке (необязательно)" name="note" maxLength={500} error={errors['note']} />
      </fieldset>
      <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : 'Добавить тренировку'}</button>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}

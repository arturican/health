import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteSteps, getSteps, saveSteps } from '../data/stepsRepository'
import { stepsSchema } from '../domain/activity'
import { parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { useDay } from '../ui/DayContext'
import { Confirmation } from '../ui/Confirmation'
import { Field } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

export function StepsForm() {
  const { day } = useDay()
  const steps = useLiveQuery(() => getSteps(day), [day])
  const action = useAction()
  const form = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    if (steps === null && action.message === 'Итог шагов удалён') form.current?.querySelector<HTMLInputElement>('[name="count"]')?.focus()
  }, [steps, action.message])

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const fieldErrors: Record<string, string> = {}
    const count = readField(new FormData(event.currentTarget), 'count', text => validate(stepsSchema.shape.count, parseNumber(text)), fieldErrors)
    setErrors(fieldErrors)
    if (count === null) {
      event.currentTarget.querySelector<HTMLInputElement>('[name="count"]')?.focus()
      return
    }
    action.run(() => saveSteps({ date: day, count }), 'Итог шагов сохранён')
  }

  if (steps === undefined) return <p role="status">Загружаем шаги…</p>
  return <section className="card" aria-labelledby="steps-title">
    <h2 id="steps-title">Шаги</h2>
    <p>{steps === null ? 'Шаги за этот день: нет данных' : `Шаги за этот день: ${steps.count.toLocaleString('ru-RU')}`}</p>
    <form ref={form} aria-label="Итог шагов" noValidate onSubmit={submit}>
      <p>Введите общий итог за день {day}. Повторный ввод заменит сохранённое значение.</p>
      <Field label="Шаги за день" name="count" inputMode="numeric" maxLength={12} required defaultValue={steps?.count ?? ''} error={errors['count']} disabled={action.pending} />
      <div className="actions">
        <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : 'Сохранить шаги'}</button>
        {steps !== null && <button type="button" disabled={action.pending} onClick={() => { setDeleting(true) }}>Удалить итог шагов</button>}
      </div>
    </form>
    {deleting && <Confirmation question={`Удалить итог шагов за ${day}?`} pending={action.pending} onCancel={() => { setDeleting(false) }} onConfirm={() => {
      action.run(async () => {
        await deleteSteps(day)
        setDeleting(false)
        setErrors({})
        const control = form.current?.elements.namedItem('count')
        if (control instanceof HTMLInputElement) control.value = ''
      }, 'Итог шагов удалён')
    }} />}
    <Feedback error={action.error} message={action.message} />
  </section>
}

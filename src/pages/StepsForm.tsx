import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useDiaryQueryState, deleteSteps, getSteps, saveSteps } from '../dataAccess'
import { stepsSchema, type Steps } from '../domain/activity'
import { parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { useDay } from '../ui/DayContext'
import { Confirmation } from '../ui/Confirmation'
import { Field } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

export function StepsForm() {
  const { day } = useDay()
  const { data: steps, current } = useDiaryQueryState(() => getSteps(day), [day])
  const action = useAction()
  const busy = action.pending || !current
  const form = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<Steps | null>(null)
  const draft = useRef<Steps | null | undefined>(undefined)
  useEffect(() => {
    if (steps === null && action.message === 'Итог шагов удалён') form.current?.querySelector<HTMLInputElement>('[name="count"]')?.focus()
  }, [steps, action.message])

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!current || deleting !== null) return
    const fieldErrors: Record<string, string> = {}
    const count = readField(new FormData(event.currentTarget), 'count', text => validate(stepsSchema.shape.count, parseNumber(text)), fieldErrors)
    setErrors(fieldErrors)
    if (count === null) {
      event.currentTarget.querySelector<HTMLInputElement>('[name="count"]')?.focus()
      return
    }
    if (draft.current === undefined) draft.current = steps ?? null
    const original = draft.current
    action.run(async () => { await saveSteps({ date: day, count }, original); draft.current = undefined }, 'Итог шагов сохранён')
  }

  if (steps === undefined) return <p role="status">Загружаем шаги…</p>
  return <section className="card" aria-labelledby="steps-title">
    <h2 id="steps-title">Шаги</h2>
    <p>{steps === null ? 'Шаги за этот день: нет данных' : `Шаги за этот день: ${steps.count.toLocaleString('ru-RU')}`}</p>
    <form ref={form} aria-label="Итог шагов" noValidate onSubmit={submit}>
      <p>Введите общий итог за день {day}. Повторный ввод заменит сохранённое значение.</p>
      <Field label="Шаги за день" name="count" inputMode="numeric" maxLength={12} required defaultValue={steps?.count ?? ''} error={errors['count']} disabled={busy}
        onChange={() => { if (draft.current === undefined) draft.current = steps }} />
      <div className="actions">
        <button type="submit" disabled={busy || deleting !== null}>{action.pending ? 'Сохраняем…' : 'Сохранить шаги'}</button>
        {steps !== null && <button type="button" disabled={busy} onClick={() => { setDeleting(steps) }}>Удалить итог шагов</button>}
        {action.error && <button type="button" disabled={busy} onClick={() => {
          draft.current = undefined; setDeleting(null); setErrors({}); action.reset()
          const control = form.current?.elements.namedItem('count')
          if (control instanceof HTMLInputElement) { control.value = steps ? String(steps.count) : ''; control.focus() }
        }}>Загрузить сохранённый итог</button>}
      </div>
    </form>
    {deleting && <Confirmation question={`Удалить итог шагов за ${deleting.date}?`} pending={action.pending} confirmDisabled={!current} onCancel={() => { setDeleting(null) }} onConfirm={() => {
      action.run(async () => {
        await deleteSteps(deleting)
        setDeleting(null)
        draft.current = undefined
        setErrors({})
        const control = form.current?.elements.namedItem('count')
        if (control instanceof HTMLInputElement) control.value = ''
      }, 'Итог шагов удалён')
    }} />}
    <Feedback error={action.error} message={action.message} />
  </section>
}

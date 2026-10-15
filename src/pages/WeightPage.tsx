import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getProfile } from '../data/profileRepository'
import { deleteWeight, listWeights, saveWeight, updateWeight } from '../data/weightRepository'
import { weightSchema, type Weight } from '../domain/profile'
import { localDate, parseDate, parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { Field } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'
import { Confirmation } from '../ui/Confirmation'
import { BmiCard } from '../ui/BmiCard'
import { WeightChart } from '../ui/WeightChart'

export function WeightPage() {
  const data = useLiveQuery(async () => ({ profile: await getProfile(), weights: await listWeights() }), [])
  const [editing, setEditing] = useState<Weight | null>(null)
  const [deleting, setDeleting] = useState<Weight | null>(null)
  const [revision, setRevision] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const action = useAction()
  const formRef = useRef<HTMLFormElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  // Запрос принадлежит render вместе с новой формой: эффект прежнего render
  // не должен забрать его из изменяемого ref до замены DOM.
  const [focusRequest, setFocusRequest] = useState<{ field: 'date' | 'kg' } | null>(null)
  const handledFocus = useRef<typeof focusRequest>(null)
  useEffect(() => {
    if (action.pending || !data?.profile || !focusRequest || handledFocus.current === focusRequest) return
    const control = formRef.current?.querySelector<HTMLInputElement>(`[name="${focusRequest.field}"]`)
    if (control) { control.focus(); handledFocus.current = focusRequest }
  }, [focusRequest, action.pending, data])
  useEffect(() => { if (action.error && deleting) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [action.error, deleting])

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const date = readField(form, 'date', text => {
      const value = parseDate(text)
      if (value > localDate()) throw new Error('Дата измерения не может быть в будущем')
      if (data?.profile?.birthDate && value < data.profile.birthDate) throw new Error('Дата измерения раньше даты рождения')
      return value
    }, fieldErrors)
    const kg = readField(form, 'kg', text => validate(weightSchema.shape.kg, parseNumber(text)), fieldErrors)
    setErrors(fieldErrors)
    if (date === null || kg === null) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    setFocusRequest({ field: 'kg' })
    action.run(async () => {
      if (editing) await updateWeight(editing.id, { date, kg })
      else await saveWeight({ date, kg })
      setEditing(null)
      setRevision(value => value + 1)
    }, 'Измерение сохранено')
  }

  return (
    <section className="page" aria-labelledby="weight-title">
      <h1 id="weight-title">Вес</h1>
      {data === undefined ? <p role="status">Загружаем историю…</p> : !data.profile ? (
        <p>Для измерений <a href="#profile">создайте профиль</a>.</p>
      ) : (
        <>
          <BmiCard profile={data.profile} weight={data.weights[0] ?? null} />
          <WeightChart weights={data.weights} />
          <form key={editing?.id ?? revision} ref={formRef} className="form-grid" aria-label={editing ? 'Редактирование веса' : 'Новое измерение'} onSubmit={submit} noValidate aria-busy={action.pending}>
            <Field label="Дата измерения" name="date" type="date" defaultValue={editing?.date ?? localDate()} max={localDate()} required disabled={action.pending} error={errors['date']} />
            <Field label="Вес, кг" name="kg" inputMode="decimal" defaultValue={editing?.kg ?? ''} required disabled={action.pending} error={errors['kg']} />
            <p>Одна запись на дату. Повторный ввод обновляет вес этой даты.</p>
            {Object.keys(errors).length > 0 && <p role="alert">Проверьте отмеченные поля.</p>}
            <div className="actions">
              <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : 'Сохранить вес'}</button>
              {editing && <button type="button" className="secondary" disabled={action.pending} onClick={() => { setFocusRequest({ field: 'kg' }); setEditing(null); setErrors({}); action.reset() }}>Отменить изменение</button>}
            </div>
          </form>
          <h2>История измерений</h2>
          {data.weights.length === 0 ? <p>Измерений пока нет. Отсутствие записи не означает нулевой вес.</p> : (
            <ul className="record-list" aria-label="История веса">
              {data.weights.map(weight => {
                const dateLabel = weight.date.split('-').reverse().join('.')
                return <li key={weight.id}>
                  <time dateTime={weight.date}>{dateLabel}</time>
                  <strong>{String(weight.kg).replace('.', ',')} кг</strong>
                  <div className="actions">
                    <button type="button" className="secondary" disabled={action.pending} aria-label={`Изменить вес за ${dateLabel}`} onClick={() => {
                      if (editing?.id === weight.id) formRef.current?.querySelector<HTMLInputElement>('[name="date"]')?.focus()
                      else setFocusRequest({ field: 'date' })
                      setEditing(weight); setErrors({}); action.reset()
                    }}>Изменить</button>
                    <button type="button" className="secondary" disabled={action.pending} aria-label={`Удалить вес за ${dateLabel}`} onClick={() => { setDeleting(weight); action.reset() }}>Удалить</button>
                  </div>
                </li>
              })}
            </ul>
          )}
          <div ref={dialog}>{deleting && <Confirmation question={`Удалить измерение за ${deleting.date.split('-').reverse().join('.')}?`} pending={action.pending} onCancel={() => { setDeleting(null); action.reset() }} onConfirm={() => {
            action.run(async () => {
              await deleteWeight(deleting.id)
              setFocusRequest({ field: 'kg' })
              setDeleting(null)
              if (editing?.id === deleting.id) { setEditing(null); setErrors({}) }
            }, 'Измерение удалено')
          }} />}</div>
        </>
      )}
      <Feedback error={deleting || Object.keys(errors).length === 0 ? action.error : null} message={Object.keys(errors).length > 0 ? null : action.message} />
    </section>
  )
}

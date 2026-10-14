import { useState, type SyntheticEvent } from 'react'
import { localDate } from '../domain/input'
import { Field } from './Field'
import { formText } from './actions'
import { useDay } from './DayContext'

export function DayPicker() {
  const { day, setDay } = useDay()
  const [error, setError] = useState<string | null>(null)
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setDay(formText(new FormData(event.currentTarget), 'day'))
      setError(null)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Проверьте дату')
      event.currentTarget.querySelector<HTMLInputElement>('input')?.focus()
    }
  }
  return (
    <form className="form-grid" aria-label="Выбор дня" onSubmit={submit} noValidate>
      <Field label="День дневника" name="day" type="date" defaultValue={day} max={localDate()} error={error ?? undefined} onChange={() => { setError(null) }} />
      <div className="actions">
        <button type="submit">Открыть день</button>
        <button type="button" className="secondary" onClick={event => {
          const input = event.currentTarget.form?.elements.namedItem('day')
          if (input instanceof HTMLInputElement) input.value = localDate()
          setDay(localDate())
          setError(null)
        }}>Сегодня</button>
      </div>
      <p>Открыт день: {day.split('-').reverse().join('.')}</p>
    </form>
  )
}

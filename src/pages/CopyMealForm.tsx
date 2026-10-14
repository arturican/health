import { useState, type SyntheticEvent } from 'react'
import { copyMeal } from '../data/foodRepository'
import { mealNames, mealSchema, type FoodEntry } from '../domain/nutrition'
import { localDate, parseDate } from '../domain/input'
import { validate } from '../domain/schema'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'
import { useDay } from '../ui/DayContext'

export function CopyMealForm({ entries }: { entries: readonly FoodEntry[] }) {
  const { day } = useDay()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const action = useAction()
  const available = mealSchema.options.filter(meal => entries.some(entry => entry.meal === meal))
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const meal = readField(form, 'meal', value => validate(mealSchema, value), fieldErrors)
    const target = readField(form, 'target', value => {
      const date = parseDate(value)
      if (date > localDate()) throw new Error('Дата копии не может быть в будущем')
      if (date === day) throw new Error('Выберите другую дату для копии')
      return date
    }, fieldErrors)
    setErrors(fieldErrors)
    if (meal === null || target === null) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => { await copyMeal(day, meal, target) }, `Приём пищи скопирован за ${target.split('-').reverse().join('.')}`)
  }
  if (available.length === 0) return null
  return (
    <>
      <h2>Копировать приём пищи</h2>
      <form className="form-grid" aria-label="Копирование приёма пищи" noValidate onSubmit={submit} aria-busy={action.pending}>
        <p>Исходный день: {day.split('-').reverse().join('.')}. Копируются снимки записей, включая продукты из архива.</p>
        <SelectField label="Приём для копирования" name="meal" defaultValue={available[0] ?? 'breakfast'} disabled={action.pending} error={errors['meal']}>
          {available.map(meal => <option key={meal} value={meal}>{mealNames[meal]}</option>)}
        </SelectField>
        <Field label="Дата копии" name="target" type="date" max={localDate()} required disabled={action.pending} error={errors['target']} />
        {Object.keys(errors).length > 0 && <p role="alert">Проверьте отмеченные поля.</p>}
        <button type="submit" disabled={action.pending}>{action.pending ? 'Копируем…' : 'Копировать приём'}</button>
      </form>
      <Feedback error={Object.keys(errors).length > 0 ? null : action.error} message={Object.keys(errors).length > 0 ? null : action.message} />
    </>
  )
}

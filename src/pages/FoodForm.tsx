import { useState, type SyntheticEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listProducts } from '../data/productRepository'
import { addFood, listFood, updateFood } from '../data/foodRepository'
import { foodEntrySchema, gramsSchema, mealNames, mealSchema, type FoodEntry } from '../domain/nutrition'
import { entityId, validate } from '../domain/schema'
import { localDate, parseDate, parseNumber } from '../domain/input'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'
import { useDay } from '../ui/DayContext'

interface FoodFormProps { entry?: FoodEntry; onSaved?: () => void; onCancel?: () => void }

export function FoodForm({ entry, onSaved, onCancel }: FoodFormProps) {
  const { day } = useDay()
  const result = useLiveQuery(async () => ({ day, products: await listProducts(), entries: await listFood(day) }), [day])
  const data = result?.day === day ? result : undefined
  const [revision, setRevision] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const action = useAction()
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const productId = entry ? entry.productId : readField(form, 'productId', value => validate(entityId, value), fieldErrors)
    const date = entry ? readField(form, 'date', value => {
      const parsed = parseDate(value)
      if (parsed > localDate()) throw new Error('Дата записи еды не может быть в будущем')
      return parsed
    }, fieldErrors) : day
    const meal = readField(form, 'meal', value => validate(mealSchema, value), fieldErrors)
    const grams = readField(form, 'grams', value => validate(gramsSchema, parseNumber(value)), fieldErrors)
    const note = readField(form, 'note', value => validate(foodEntrySchema.shape.note, value), fieldErrors)
    setErrors(fieldErrors)
    if ((!entry && productId === null) || date === null || meal === null || grams === null || note === null) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      if (entry) await updateFood(entry.id, { date, meal, grams, note })
      else await addFood({ date, productId, meal, grams, note })
      setRevision(value => value + 1)
      onSaved?.()
    }, entry ? 'Запись еды изменена' : 'Запись еды добавлена')
  }
  return (
    <>
      <h2>{entry ? 'Редактирование еды' : 'Запись еды'}</h2>
      <p>Еда за {(entry?.date ?? day).split('-').reverse().join('.')}</p>
      {data === undefined ? <p role="status">Загружаем продукты для записи…</p> : (
        <>
          {!entry && <p>Записей еды: {data.entries.length}</p>}
          {data.products.length === 0 && !entry ? <p>Сначала добавьте активный продукт в каталог ниже.</p> : (
            <form key={revision} className="form-grid" aria-label={entry ? 'Редактирование еды' : 'Добавление еды'} noValidate onSubmit={submit} aria-busy={action.pending}>
              <fieldset disabled={action.pending}>
                <legend>Продукт и порция</legend>
                {entry ? <>
                  <p>Продукт: {entry.snapshot.name}. Снимок записи сохраняется.</p>
                  <Field label="Дата записи еды" name="date" type="date" defaultValue={entry.date} max={localDate()} required error={errors['date']} />
                </> : <SelectField label="Продукт для записи" name="productId" defaultValue="" required error={errors['productId']}>
                  <option value="">Выберите продукт</option>
                  {data.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                </SelectField>}
                <SelectField label="Приём пищи" name="meal" defaultValue={entry?.meal ?? 'breakfast'} error={errors['meal']}>
                  {mealSchema.options.map(meal => <option key={meal} value={meal}>{mealNames[meal]}</option>)}
                </SelectField>
                <Field label="Масса порции, г" name="grams" inputMode="decimal" defaultValue={entry?.grams ?? ''} required error={errors['grams']} />
                <Field label="Комментарий к еде (необязательно)" name="note" maxLength={500} defaultValue={entry?.note ?? ''} error={errors['note']} />
              </fieldset>
              {Object.keys(errors).length > 0 && <p role="alert">Проверьте отмеченные поля.</p>}
              <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : entry ? 'Сохранить запись еды' : 'Добавить еду'}</button>
              {onCancel && <button type="button" className="secondary" disabled={action.pending} onClick={onCancel}>Отменить правку еды</button>}
            </form>
          )}
        </>
      )}
      <Feedback error={Object.keys(errors).length > 0 ? null : action.error} message={Object.keys(errors).length > 0 ? null : action.message} />
    </>
  )
}

import { useEffect, useId, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listFood } from '../data/foodRepository'
import { getNutritionDay, setNutritionDay } from '../data/nutritionRepository'
import { foodTotals } from '../domain/nutrition'
import { useDay } from './DayContext'
import { Feedback, useAction } from './actions'

function amount(value: number | null, unit: string) {
  return value === null ? 'нет данных' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${unit}`
}

export function NutritionSummary() {
  const title = useId()
  const { day } = useDay()
  const result = useLiveQuery(async () => ({ day, entries: await listFood(day), status: await getNutritionDay(day) }), [day])
  const data = result?.day === day ? result : undefined
  const complete = data?.status?.complete ?? false
  const totals = data ? foodTotals(data.entries, complete) : null
  const action = useAction()
  const checkbox = useRef<HTMLInputElement>(null)
  const focusAfterSave = useRef<string | null>(null)
  useEffect(() => {
    if (action.pending || focusAfterSave.current === null) return
    const savedDay = focusAfterSave.current
    focusAfterSave.current = null
    if (savedDay === day) checkbox.current?.focus()
  }, [action.pending, action.error, action.message, day])
  return (
    <section className="card" aria-labelledby={title}>
      <h2 id={title}>Итоги питания</h2>
      {totals === null ? <p role="status">Загружаем итоги…</p> : (
        <>
          <p>{complete ? 'Вся еда за день внесена.' : 'Дневник питания неполный. Учтены только внесённые записи.'}</p>
          <p>Калории: {amount(totals.kcal, 'ккал')}</p>
          <p>Белки: {amount(totals.protein, 'г')}</p>
          <p>Жиры: {amount(totals.fat, 'г')}</p>
          <p>Углеводы: {amount(totals.carbs, 'г')}</p>
        </>
      )}
      <label><input ref={checkbox} type="checkbox" checked={complete} disabled={!data || action.pending} onChange={event => {
        const checked = event.target.checked
        if (event.currentTarget === document.activeElement) focusAfterSave.current = day
        action.run(() => setNutritionDay(day, checked), 'Полнота дня сохранена')
      }} /> За этот день внесена вся еда</label>
      <p>Отмечайте после внесения всей еды. Неизвестные БЖУ остаются неизвестными.</p>
      <Feedback error={action.error} message={action.message} />
    </section>
  )
}

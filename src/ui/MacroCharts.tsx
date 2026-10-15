import { useId } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { listFood } from '../data/foodRepository'
import { getNutritionDay } from '../data/nutritionRepository'
import { foodTotals, mealNames } from '../domain/nutrition'
import { useDay } from './DayContext'
import '../macro-charts.css'

const macros = [
  { key: 'protein', name: 'Белки', path: 'M12 3C8 3 5 11 5 15a7 7 0 0 0 14 0c0-4-3-12-7-12Z M9 15a3 3 0 0 0 3 3' },
  { key: 'fat', name: 'Жиры', path: 'M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z M9 15a3 3 0 0 0 3 3' },
  { key: 'carbs', name: 'Углеводы', path: 'M12 21V3 M12 9C7 9 5 6 5 3c5 0 7 3 7 6Z M12 15c-5 0-7-3-7-6 5 0 7 3 7 6Z M12 12c5 0 7-3 7-6-5 0-7 3-7 6Z M12 18c5 0 7-3 7-6-5 0-7 3-7 6Z' },
] as const
const grams = (value: number | null) => value === null ? 'нет данных' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} г`

export function MacroCharts() {
  const title = useId()
  const { day } = useDay()
  const result = useLiveQuery(() => db.transaction('r', db.foodEntries, db.nutritionDays, async () => ({
    day, entries: await listFood(day), status: await getNutritionDay(day),
  })), [day])
  const data = result?.day === day ? result : undefined
  const totals = data ? foodTotals(data.entries, data.status?.complete ?? false) : null
  const meals = (['breakfast', 'lunch', 'snack', 'dinner'] as const).map(meal => ({
    meal, totals: data ? foodTotals(data.entries.filter(entry => entry.meal === meal), data.status?.complete ?? false) : null,
  }))
  const maximum = Math.max(1, ...macros.map(({ key }) => totals?.[key] ?? 0), ...meals.flatMap(meal => macros.map(({ key }) => meal.totals?.[key] ?? 0)))
  return <section className="card macro-charts" aria-labelledby={title}>
    <h2 id={title}>Белки, жиры и углеводы</h2>
    {!totals ? <p role="status">Загружаем БЖУ…</p> : <>
      <p>За выбранный день · по записанным продуктам и порциям</p>
      <div className="macro-cards">{macros.map(({ key, name, path }) => <div className={`macro-card macro-${key}`} key={key}>
        <span className="macro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg></span>
        <h3>{name}</h3><strong>{grams(totals[key])}</strong>
        {totals[key] !== null && <meter min={0} max={maximum} value={totals[key]} aria-label={`${name} за день`} aria-valuetext={grams(totals[key])} />}
      </div>)}</div>
      <h3>БЖУ по приёмам пищи</h3>
      <div className="macro-meals">{meals.map(({ meal, totals: values }) => <section key={meal} aria-label={mealNames[meal]}>
        <h4>{mealNames[meal]}</h4>
        {macros.map(({ key, name }) => <div className={`macro-meal-row macro-${key}`} key={key}>
          <span>{name}</span><strong>{grams(values?.[key] ?? null)}</strong>
          {values?.[key] !== null && values?.[key] !== undefined && <meter min={0} max={maximum} value={values[key]} aria-label={`${mealNames[meal]}: ${name}`} aria-valuetext={grams(values[key])} />}
        </div>)}
      </section>)}</div>
      <p className="chart-note">Общая шкала: 0–{grams(maximum)}. Это граммы, не проценты нормы. Если состав продукта неизвестен, сумма соответствующего БЖУ не показана.</p>
    </>}
  </section>
}

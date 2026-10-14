import { useId } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getEnergyPlan } from '../data/energyPlanRepository'
import { listFood } from '../data/foodRepository'
import { getNutritionDay } from '../data/nutritionRepository'
import { db } from '../data/db'
import { calculateEnergyDay, calculateExpenditure } from '../domain/energy'
import { foodTotals } from '../domain/nutrition'
import { useDay } from './DayContext'

function exact(value: number | null) { return value === null ? 'нет данных' : `${String(value).replace('.', ',')} ккал` }
function estimate(value: number | null) { return value === null ? 'нет данных' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ккал` }

export function EnergySummary() {
  const title = useId()
  const { day } = useDay()
  const result = useLiveQuery(() => db.transaction('r', [db.energyPlans, db.foodEntries, db.nutritionDays], async () => ({ day, plan: await getEnergyPlan(day), entries: await listFood(day), status: await getNutritionDay(day) })), [day])
  const data = result?.day === day ? result : undefined
  if (!data) return <section className="card" aria-labelledby={title}><h2 id={title}>Цель и оценочный баланс</h2><p role="status">Загружаем энергетические показатели…</p></section>
  const { plan } = data
  const complete = data.status?.complete ?? false
  const intake = foodTotals(data.entries, complete).kcal
  const goal = plan?.goalKcal ?? null
  const expenditure = plan ? calculateExpenditure(plan) : null
  const values = calculateEnergyDay({ goalKcal: goal, intakeKcal: intake, expenditureKcal: expenditure, complete })
  return <section className="card" aria-labelledby={title}>
    <h2 id={title}>Цель и оценочный баланс</h2>
    <h3>Калорийная цель</h3>
    <p>Цель: {exact(goal)}. Внесённая еда: {estimate(intake)}.</p>
    {goal !== null && goal > 0 && intake !== null && <meter aria-label="Внесённая еда относительно цели" min={0} max={goal} value={Math.min(intake, goal)}>{estimate(intake)} из {exact(goal)}</meter>}
    <p>Остаток цели по внесённой еде: {estimate(values.goalRemaining)}.</p>
    <p>{complete ? 'Записи питания подтверждены как полный день.' : 'Учтена только внесённая еда; дневник неполный.'}</p>
    <h3>Оценочный суточный баланс</h3>
    <p>Общая оценка расхода: {plan?.method === 'manual' ? exact(expenditure) : estimate(expenditure)}.</p>
    <p aria-live="polite" aria-atomic="true">Расход минус питание: {estimate(values.balance)}.</p>
    {!complete && <p>Для оценки баланса подтвердите полноту дня в итогах питания.</p>}
    <p>Положительное значение — расход выше питания; отрицательное — питание выше расхода. Это оценка, а не рекомендация.</p>
    {plan ? <p>Версия {plan.revision}, действует с {plan.effectiveFrom}. Способ: {plan.method === 'none' ? 'не задан' : plan.method === 'manual' ? 'общая ручная оценка' : `расход в покое × коэффициент ${String(plan.factor).replace('.', ',')}`}.{plan.source && ` Источник: ${plan.source}.`}</p> : <p>Для этого дня план не задан. <a href="#settings">Настроить цель и расход</a>.</p>}
    <p>Шаги и тренировки дополнительно к общему расходу не прибавляются. Итоги и разности показаны с округлением до 0,1 ккал; расчёт хранит исходную точность.</p>
    {plan?.method === 'factor' && <p>Расход в покое рассчитан по сохранённому снимку Mifflin–St Jeor для возраста 19–78 лет. Это справочная оценка без индивидуального измерения. <a href="#settings">Посмотреть параметры и ограничения формулы</a>.</p>}
  </section>
}

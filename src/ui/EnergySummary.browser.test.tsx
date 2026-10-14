import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { db } from '../data/db'
import type { EnergyPlan } from '../domain/energyPlan'
import type { FoodEntry } from '../domain/nutrition'
import { DayProvider } from './DayContext'
import { DayPicker } from './DayPicker'
import { EnergySummary } from './EnergySummary'
import { NutritionSummary } from './NutritionSummary'
import '../styles.css'

const today = '2026-10-14'
async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', [db.energyPlans, db.foodEntries, db.nutritionDays, db.steps, db.workouts], async () => {
    await db.energyPlans.clear()
    await db.foodEntries.clear()
    await db.nutritionDays.clear()
    await db.steps.clear()
    await db.workouts.clear()
  })
}
beforeEach(async () => {
  await resetTestState()
  await page.viewport(375, 812)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
  vi.useRealTimers()
})

function Diary() {
  return <DayProvider><main><h1>Питание</h1><DayPicker /><NutritionSummary /><EnergySummary /></main></DayProvider>
}

test('цель и баланс учитывают дату, полноту и явные нули без добавления активности', async () => {
  const plan: EnergyPlan = {
    id: '00000000-0000-4000-8000-000000000001', revision: 1, createdOn: today, effectiveFrom: today,
    goalKcal: 1800, method: 'manual', manualKcal: 2000, factor: null, source: 'Синтетическая общая оценка',
    restingFormula: 'mifflin-st-jeor-1990',
    snapshot: { kg: null, weightDate: null, heightCm: null, age: null, formulaSex: 'none' },
  }
  const food: FoodEntry = {
    id: '00000000-0000-4000-8000-000000000002', date: today, meal: 'lunch', productId: null, grams: 150, note: '',
    snapshot: { name: 'Синтетическая еда', source: 'Синтетическая этикетка', kcal: 1000, protein: null, fat: 0, carbs: 0 },
  }
  await db.transaction('rw', db.energyPlans, db.foodEntries, async () => {
    await db.energyPlans.add(plan)
    await db.foodEntries.add(food)
  })
  const view = await render(<Diary />)
  const energy = page.getByRole('region', { name: 'Цель и оценочный баланс', exact: true })
  const fullness = page.getByLabelText('За этот день внесена вся еда', { exact: true })
  const meter = energy.getByRole('meter', { name: 'Внесённая еда относительно цели', exact: true })
  await expect.element(energy.getByText('Цель: 1800 ккал. Внесённая еда: 1 500 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Остаток цели по внесённой еде: 300 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Общая оценка расхода: 2000 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Расход минус питание: нет данных.', { exact: true })).toBeVisible()
  await expect.element(meter).toHaveAttribute('max', '1800')
  await expect.element(meter).toHaveAttribute('value', '1500')
  expect((await axe.run(view.container)).violations).toEqual([])

  await fullness.click()
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()
  expect(await db.nutritionDays.get(today)).toEqual({ date: today, complete: true })
  await expect.element(fullness).toHaveFocus()
  await userEvent.keyboard(' ')
  await expect.element(fullness).not.toBeChecked()
  await expect.element(energy.getByText('Расход минус питание: нет данных.', { exact: true })).toBeVisible()
  await userEvent.keyboard(' ')
  await expect.element(fullness).toBeChecked()
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()
  await db.transaction('rw', db.steps, db.workouts, async () => {
    await db.steps.add({ date: today, count: 90000 })
    await db.workouts.add({ id: '00000000-0000-4000-8000-000000000003', date: today, kind: 'Синтетическая тренировка', minutes: 90, kcal: 9000, source: 'Синтетическая оценка', note: '' })
  })

  await page.getByLabelText('День дневника', { exact: true }).fill('2026-10-13')
  await page.getByRole('button', { name: 'Открыть день', exact: true }).click()
  await expect.element(energy.getByText('Цель: нет данных. Внесённая еда: нет данных.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Общая оценка расхода: нет данных.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Расход минус питание: нет данных.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Для этого дня план не задан.', { exact: false })).toBeVisible()
  await expect.element(meter).not.toBeInTheDocument()
  await expect.element(fullness).not.toBeChecked()
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
  await expect.element(page.getByLabelText('День дневника', { exact: true })).toHaveValue(today)
  await expect.element(energy.getByText('Остаток цели по внесённой еде: 300 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Общая оценка расхода: 2000 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()
  await view.unmount()
  const reopened = await render(<Diary />)
  await expect.element(fullness).toBeChecked()
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()

  const zeroPlan: EnergyPlan = { ...plan, id: '00000000-0000-4000-8000-000000000004', revision: 2, goalKcal: 0, manualKcal: 0 }
  await db.energyPlans.add(zeroPlan)
  await expect.element(energy.getByText('Цель: 0 ккал. Внесённая еда: 1 500 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Общая оценка расхода: 0 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Остаток цели по внесённой еде: -1 500 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Расход минус питание: -1 500 ккал.', { exact: true })).toBeVisible()
  await expect.element(meter).not.toBeInTheDocument()
  expect(await db.energyPlans.get(plan.id)).toEqual(plan)
  expect(await db.foodEntries.toArray()).toEqual([food])
  expect(await db.steps.get(today)).toEqual({ date: today, count: 90000 })
  expect(await db.workouts.count()).toBe(1)
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

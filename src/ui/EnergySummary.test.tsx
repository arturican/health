import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { addFood } from '../data/foodRepository'
import { addEnergyPlan } from '../data/energyPlanRepository'
import { setNutritionDay } from '../data/nutritionRepository'
import { DayProvider } from './DayContext'
import { DayPicker } from './DayPicker'
import { NutritionSummary } from './NutritionSummary'
import { EnergySummary } from './EnergySummary'

async function clear() {
  await Promise.all([db.energyPlans.clear(), db.foodEntries.clear(), db.nutritionDays.clear(), db.products.clear(), db.profiles.clear(), db.weights.clear()])
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await clear()
})
afterEach(async () => { cleanup(); await clear(); vi.useRealTimers() })
function open() { return render(<DayProvider><DayPicker /><NutritionSummary /><EnergySummary /></DayProvider>) }
async function plan(goalKcal: number | null = 1800, manualKcal = 2000) {
  return addEnergyPlan({ effectiveFrom: '2026-10-14', goalKcal, method: 'manual', manualKcal, factor: null, source: 'Синтетическая оценка' })
}
async function food() {
  const product = { id: '00000000-0000-4000-8000-000000000001', name: 'Синтетическая еда', source: '', kcal: 1000, protein: null, fat: null, carbs: 0, archived: false }
  await db.products.put(product)
  await addFood({ date: '2026-10-14', productId: product.id, grams: 150, meal: 'lunch', note: '' })
}

it('показывает неизвестные величины без подстановки нулей', async () => {
  open()
  expect(await screen.findByText('Цель: нет данных. Внесённая еда: нет данных.')).toBeVisible()
  expect(screen.getByText('Расход минус питание: нет данных.')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Настроить цель и расход' })).toHaveAttribute('href', '#settings')
  expect(screen.queryByRole('meter')).not.toBeInTheDocument()
})

it('разделяет остаток и баланс, реагирует на полноту и выбранный день', async () => {
  await plan()
  await food()
  open()
  expect(await screen.findByText('Остаток цели по внесённой еде: 300 ккал.')).toBeVisible()
  expect(screen.getByText('Расход минус питание: нет данных.')).toBeVisible()
  expect(screen.getByRole('meter')).toHaveAttribute('value', '1500')
  fireEvent.click(screen.getByLabelText('За этот день внесена вся еда'))
  expect(await screen.findByText('Расход минус питание: 500 ккал.')).toBeVisible()
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value: '2026-10-13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  expect(await screen.findByText('Цель: нет данных. Внесённая еда: нет данных.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
  expect(await screen.findByText('Расход минус питание: 500 ккал.')).toBeVisible()
})

it('не делит на ноль и показывает точный ручной расход; превышение цели остаётся текстом', async () => {
  await plan(0, 0.25)
  await food()
  await setNutritionDay('2026-10-14', true)
  const view = open()
  expect(await screen.findByText('Общая оценка расхода: 0,25 ккал.')).toBeVisible()
  expect(screen.getByText('Остаток цели по внесённой еде: -1 500 ккал.')).toBeVisible()
  expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  view.unmount()
  await plan(1000, 0)
  open()
  await waitFor(() => { expect(screen.getByRole('meter')).toHaveAttribute('value', '1000') })
  expect(screen.getByText('Остаток цели по внесённой еде: -500 ккал.')).toBeVisible()
  expect(screen.getByText('Расход минус питание: -1 500 ккал.')).toBeVisible()
})

it('показывает коэффициент и источник, но не придумывает расход при неполном снимке', async () => {
  await addEnergyPlan({ effectiveFrom: '2026-10-14', goalKcal: null, method: 'factor', manualKcal: null, factor: 1.4, source: 'Синтетический коэффициент' })
  await setNutritionDay('2026-10-14', true)
  open()
  expect(await screen.findByText('Общая оценка расхода: нет данных.')).toBeVisible()
  expect(screen.getByText('Расход минус питание: нет данных.')).toBeVisible()
  expect(screen.getByText(/расход в покое × коэффициент 1,4/)).toHaveTextContent('Синтетический коэффициент')
  expect(screen.getByRole('link', { name: 'Посмотреть параметры и ограничения формулы' })).toHaveAttribute('href', '#settings')
})

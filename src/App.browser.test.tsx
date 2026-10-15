import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from './App'
import { db } from './data/db'
import type { EnergyPlan } from './domain/energyPlan'
import type { FoodEntry } from './domain/nutrition'
import './styles.css'
import './shell.css'

const today = '2026-10-14'
async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans], async () => {
    await db.metadata.clear()
    await db.profiles.clear()
    await db.weights.clear()
    await db.products.clear()
    await db.foodEntries.clear()
    await db.nutritionDays.clear()
    await db.steps.clear()
    await db.workouts.clear()
    await db.energyPlans.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
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
async function expectAccessiblePage(container: HTMLElement) {
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}

test('пустая сводка показывает отсутствие данных и предлагает профиль, переход доступен клавиатурой', async () => {
  const view = await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Сегодня', exact: true })).toBeVisible()
  await expect.element(page.getByRole('heading', { name: 'Начните с профиля', exact: true })).toBeVisible()
  await expect.element(page.getByText('Нет измерений не позже выбранного дня.', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Шаги: нет данных.', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Тренировки не записаны.', { exact: true })).toBeVisible()
  const energy = page.getByRole('region', { name: 'Цель и оценочный баланс', exact: true })
  await expect.element(energy.getByText('Цель: нет данных. Внесённая еда: нет данных.', { exact: true })).toBeVisible()
  await expectAccessiblePage(view.container)
  await userEvent.keyboard('{Tab}')
  await expect.element(page.getByRole('link', { name: 'Перейти к содержимому', exact: true })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('main')).toHaveFocus()
  await page.getByRole('link', { name: 'Заполнить профиль', exact: true }).click()
  await expect.element(page.getByRole('form', { name: 'Создание профиля', exact: true })).toBeVisible()
  expect(window.location.hash).toBe('#profile')
  await expectAccessiblePage(view.container)
})

test('сводка использует данные выбранного дня и сохраняет день при переходах между разделами', async () => {
  const plan: EnergyPlan = {
    id: '00000000-0000-4000-8000-000000000001', revision: 1, createdOn: today, effectiveFrom: today,
    goalKcal: 1800, method: 'manual', manualKcal: 2000, factor: null, source: 'Синтетическая общая оценка', restingFormula: 'mifflin-st-jeor-1990',
    snapshot: { kg: 81, weightDate: today, heightCm: 180, age: 30, formulaSex: 'male' },
  }
  const food: FoodEntry = {
    id: '00000000-0000-4000-8000-000000000002', date: today, meal: 'lunch', productId: null, grams: 150, note: '',
    snapshot: { name: 'Синтетическая еда сводки', source: 'Синтетическая этикетка', kcal: 1000, protein: null, fat: 0, carbs: 0 },
  }
  await db.transaction('rw', [db.profiles, db.weights, db.foodEntries, db.energyPlans, db.steps, db.workouts], async () => {
    await db.profiles.add({ id: 'self', name: 'Синтетический профиль сводки', heightCm: 180, birthDate: '1996-10-14', formulaSex: 'male' })
    await db.weights.bulkAdd([
      { id: '00000000-0000-4000-8000-000000000003', date: '2026-10-12', kg: 72 },
      { id: '00000000-0000-4000-8000-000000000004', date: today, kg: 81 },
    ])
    await db.foodEntries.add(food)
    await db.energyPlans.add(plan)
    await db.steps.add({ date: today, count: 0 })
    await db.workouts.add({ id: '00000000-0000-4000-8000-000000000005', date: today, kind: 'Синтетическая тренировка сводки', minutes: 30.5, kcal: null, source: '', note: '' })
  })
  const view = await render(<App />)
  const bmi = page.getByRole('region', { name: 'ИМТ (справочно)', exact: true })
  const energy = page.getByRole('region', { name: 'Цель и оценочный баланс', exact: true })
  const activity = page.getByRole('region', { name: 'Активность за день', exact: true })
  const day = page.getByLabelText('День дневника', { exact: true })
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  await expect.element(page.getByText('81 кг, измерено 14.10.2026.', { exact: true })).toBeVisible()
  await expect.element(bmi.getByText('25,0', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Остаток цели по внесённой еде: 300 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Расход минус питание: нет данных.', { exact: true })).toBeVisible()
  await expect.element(activity.getByText('Шаги: 0.', { exact: true })).toBeVisible()
  await expect.element(activity.getByRole('list', { name: 'Сводка тренировок' }).getByText('Синтетическая тренировка сводки', { exact: true })).toBeVisible()
  await expect.element(activity.getByText('30,5 мин; ручная оценка: нет данных', { exact: true })).toBeVisible()
  const fullness = page.getByLabelText('За этот день внесена вся еда', { exact: true })
  await fullness.click()
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()
  await expect.element(fullness).toHaveFocus()
  await userEvent.keyboard(' ')
  await expect.element(energy.getByText('Расход минус питание: нет данных.', { exact: true })).toBeVisible()
  await userEvent.keyboard(' ')
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()
  await expectAccessiblePage(view.container)

  await day.fill('2026-10-13')
  await page.getByRole('button', { name: 'Открыть день', exact: true }).click()
  await expect.element(page.getByText('72 кг, измерено 12.10.2026.', { exact: true })).toBeVisible()
  await expect.element(bmi.getByText('22,2', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Цель: нет данных. Внесённая еда: нет данных.', { exact: true })).toBeVisible()
  await expect.element(activity.getByText('Шаги: нет данных.', { exact: true })).toBeVisible()
  await expect.element(activity.getByText('Тренировки не записаны.', { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Питание', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 1, name: 'Питание', exact: true })).toBeVisible()
  await expect.element(day).toHaveValue('2026-10-13')
  await expect.element(page.getByText('Еда за 13.10.2026', { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Активность', exact: true }).click()
  await expect.element(day).toHaveValue('2026-10-13')
  await expect.element(page.getByText('Шаги за этот день: нет данных', { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Сегодня', exact: true }).click()
  await expect.element(day).toHaveValue('2026-10-13')
  await expect.element(page.getByText('Сводка за 13.10.2026. Дневник хранится в этом браузере.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
  await expect.element(day).toHaveValue(today)
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()
  const quick = page.getByRole('navigation', { name: 'Быстрые записи', exact: true })
  await quick.getByRole('link', { name: 'Записать еду', exact: true }).click()
  await expect.element(day).toHaveValue(today)
  await expect.element(page.getByText('Еда за 14.10.2026', { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Сегодня', exact: true }).click()
  await quick.getByRole('link', { name: 'Открыть активность', exact: true }).click()
  await expect.element(page.getByText('Шаги за этот день: 0', { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Сегодня', exact: true }).click()
  await day.fill('2026-10-13')
  await page.getByRole('button', { name: 'Открыть день', exact: true }).click()
  await expect.element(activity.getByText('Шаги: нет данных.', { exact: true })).toBeVisible()
  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(day).toHaveValue(today)
  await expect.element(page.getByText('81 кг, измерено 14.10.2026.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Общая оценка расхода: 2000 ккал.', { exact: true })).toBeVisible()
  await expect.element(energy.getByText('Расход минус питание: 500 ккал.', { exact: true })).toBeVisible()
  expect(await db.nutritionDays.toArray()).toEqual([{ date: today, complete: true }])
  expect(await db.energyPlans.get(plan.id)).toEqual(plan)
  expect(await db.foodEntries.toArray()).toEqual([food])
  await expectAccessiblePage(reopened.container)
}, 15000)

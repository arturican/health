import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { addFood } from '../data/foodRepository'
import { DayProvider } from './DayContext'
import { DayPicker } from './DayPicker'
import { NutritionSummary } from './NutritionSummary'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await Promise.all([db.products.clear(), db.foodEntries.clear(), db.nutritionDays.clear()])
})
afterEach(async () => {
  cleanup()
  await Promise.all([db.products.clear(), db.foodEntries.clear(), db.nutritionDays.clear()])
  vi.useRealTimers()
})

it('не показывает нули до подтверждения полного дня и сохраняет полноту', async () => {
  const view = render(<DayProvider><NutritionSummary /></DayProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем итоги')
  expect(await screen.findByText('Калории: нет данных')).toBeVisible()
  fireEvent.click(screen.getByLabelText('За этот день внесена вся еда'))
  expect(await screen.findByText('Калории: 0 ккал')).toBeVisible()
  expect(screen.getByText('Белки: 0 г')).toBeVisible()
  view.unmount()
  render(<DayProvider><NutritionSummary /></DayProvider>)
  expect(await screen.findByText('Вся еда за день внесена.')).toBeVisible()
  expect(screen.getByLabelText('За этот день внесена вся еда')).toBeChecked()
  fireEvent.click(screen.getByLabelText('За этот день внесена вся еда'))
  expect(await screen.findByText('Калории: нет данных')).toBeVisible()
  expect((await db.nutritionDays.get('2026-10-14'))?.complete).toBe(false)
})

it('показывает суммы записанных порций и неизвестные макросы, изолируя дни', async () => {
  const product = { id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт', source: '', kcal: 250, protein: 12, fat: null, carbs: 0, archived: false }
  await db.products.put(product)
  await addFood({ date: '2026-10-14', productId: product.id, grams: 150, meal: 'lunch', note: '' })
  render(<DayProvider><DayPicker /><NutritionSummary /></DayProvider>)
  expect(await screen.findByText('Калории: 375 ккал')).toBeVisible()
  expect(screen.getByText('Белки: 18 г')).toBeVisible()
  expect(screen.getByText('Жиры: нет данных')).toBeVisible()
  expect(screen.getByText('Углеводы: 0 г')).toBeVisible()
  expect(screen.getByText(/Дневник питания неполный/)).toBeVisible()
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value: '2026-10-13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  expect(await screen.findByText('Калории: нет данных')).toBeVisible()
  expect(await db.foodEntries.count()).toBe(1)
})

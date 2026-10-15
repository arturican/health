import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { addFood } from '../data/foodRepository'
import { setNutritionDay } from '../data/nutritionRepository'
import { DayProvider } from './DayContext'
import { DayPicker } from './DayPicker'
import { MacroCharts } from './MacroCharts'

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

it('отличает неизвестный день от подтверждённого нуля', async () => {
  render(<DayProvider><MacroCharts /></DayProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем БЖУ')
  await screen.findByRole('heading', { name: 'БЖУ по приёмам пищи' })
  expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  await setNutritionDay('2026-10-14', true)
  expect(await screen.findByRole('meter', { name: 'Белки за день' })).toHaveAttribute('value', '0')
  expect(screen.getByRole('meter', { name: 'Завтрак: Белки' })).toHaveAttribute('aria-valuetext', '0 г')
})

it('учитывает массу порции, неизвестный состав и смену дня', async () => {
  const product = { id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт', source: '', kcal: 250, protein: 12, fat: null, carbs: 0, archived: false }
  await db.products.put(product)
  await addFood({ date: '2026-10-14', productId: product.id, grams: 150, meal: 'lunch', note: '' })
  render(<DayProvider><DayPicker /><MacroCharts /></DayProvider>)
  expect(await screen.findByRole('meter', { name: 'Белки за день' })).toHaveAttribute('value', '18')
  expect(screen.getByRole('meter', { name: 'Обед: Белки' })).toHaveAttribute('aria-valuetext', '18 г')
  expect(screen.queryByRole('meter', { name: 'Жиры за день' })).not.toBeInTheDocument()
  expect(screen.getByRole('meter', { name: 'Углеводы за день' })).toHaveAttribute('value', '0')
  expect(screen.queryByRole('meter', { name: 'Завтрак: Белки' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value: '2026-10-13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  await waitFor(() => expect(screen.queryByRole('meter')).not.toBeInTheDocument())
  await screen.findByRole('heading', { name: 'БЖУ по приёмам пищи' })
  expect(screen.queryByRole('meter')).not.toBeInTheDocument()
})

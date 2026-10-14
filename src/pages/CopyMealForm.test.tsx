import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as repository from '../data/foodRepository'
import type { FoodEntry } from '../domain/nutrition'
import { DayProvider } from '../ui/DayContext'
import { CopyMealForm } from './CopyMealForm'

const entry: FoodEntry = {
  id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', meal: 'lunch', productId: null,
  snapshot: { name: 'Синтетический продукт', source: '', kcal: 250, protein: null, fat: 0, carbs: 20 }, grams: 150, note: 'Тест',
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await db.foodEntries.clear()
  await db.foodEntries.put(entry)
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.foodEntries.clear()
  vi.useRealTimers()
})

it('показывает только непустые приёмы и копирует их на явную дату', async () => {
  render(<DayProvider><CopyMealForm entries={[entry]} /></DayProvider>)
  expect(screen.getByLabelText('Приём для копирования')).toHaveValue('lunch')
  expect(screen.queryByRole('option', { name: 'Завтрак' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Дата копии'), { target: { value: '2026-10-13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Копировать приём' }))
  expect(await screen.findByText('Приём пищи скопирован за 13.10.2026')).toBeVisible()
  const copy = (await repository.listFood('2026-10-13'))[0]
  expect(copy).toMatchObject({ snapshot: entry.snapshot, meal: entry.meal, grams: entry.grams, note: entry.note })
  expect(copy?.id).not.toBe(entry.id)
  expect(await repository.listFood('2026-10-14')).toEqual([entry])
})

it.each(['', '2026-10-14', '2026-10-15'])('отклоняет дату копии %s с фокусом и без записи', async value => {
  render(<DayProvider><CopyMealForm entries={[entry]} /></DayProvider>)
  fireEvent.change(screen.getByLabelText('Дата копии'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Копировать приём' }))
  expect(screen.getByLabelText('Дата копии')).toHaveFocus()
  expect(screen.getByLabelText('Дата копии')).toHaveAttribute('aria-invalid', 'true')
  expect(await db.foodEntries.count()).toBe(1)
})

it('не предлагает пустой приём и сохраняет дату после ошибки хранилища', async () => {
  const view = render(<DayProvider><CopyMealForm entries={[]} /></DayProvider>)
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  view.unmount()
  render(<DayProvider><CopyMealForm entries={[entry]} /></DayProvider>)
  vi.spyOn(repository, 'copyMeal').mockRejectedValueOnce(Object.assign(new Error('synthetic'), { name: 'QuotaExceededError' }))
  fireEvent.change(screen.getByLabelText('Дата копии'), { target: { value: '2026-10-13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Копировать приём' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByLabelText('Дата копии')).toHaveValue('2026-10-13')
  expect(await db.foodEntries.count()).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Копировать приём' }))
  expect(await screen.findByText('Приём пищи скопирован за 13.10.2026')).toBeVisible()
})

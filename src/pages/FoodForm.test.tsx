import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as repository from '../data/foodRepository'
import { FoodForm } from './FoodForm'
import { DayProvider } from '../ui/DayContext'
import { DayPicker } from '../ui/DayPicker'

const product = { id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт', source: '', kcal: 250, protein: 12, fat: null, carbs: 0, archived: false }
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await Promise.all([db.foodEntries.clear(), db.products.clear()])
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all([db.foodEntries.clear(), db.products.clear()])
  vi.useRealTimers()
})
async function openFood() {
  await db.products.put(product)
  render(<DayProvider><DayPicker /><FoodForm /></DayProvider>)
  await screen.findByRole('form', { name: 'Добавление еды' })
}
function save(grams = '150,5') {
  fireEvent.change(screen.getByLabelText('Продукт для записи'), { target: { value: product.id } })
  fireEvent.change(screen.getByLabelText('Масса порции, г'), { target: { value: grams } })
  fireEvent.click(screen.getByRole('button', { name: 'Добавить еду' }))
}

it('показывает загрузку и объясняет отсутствие активного продукта', async () => {
  render(<DayProvider><FoodForm /></DayProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем продукты')
  expect(await screen.findByText(/Сначала добавьте активный продукт/)).toBeVisible()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
})

it('сохраняет выбранный день, продукт, приём и массу; смена дня меняет счётчик', async () => {
  await openFood()
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value: '2026-10-13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  await screen.findByRole('form', { name: 'Добавление еды' })
  fireEvent.change(screen.getByLabelText('Приём пищи'), { target: { value: 'lunch' } })
  fireEvent.change(screen.getByLabelText('Комментарий к еде (необязательно)'), { target: { value: '  Тест  ' } })
  save()
  expect(await screen.findByText('Запись еды добавлена')).toBeVisible()
  expect(await screen.findByText('Записей еды: 1')).toBeVisible()
  const entries = await db.foodEntries.toArray()
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({ date: '2026-10-13', meal: 'lunch', productId: product.id, grams: 150.5, note: 'Тест', snapshot: { kcal: 250, fat: null, carbs: 0 } })
  await waitFor(() => { expect(screen.getByLabelText('Масса порции, г')).toHaveValue('') })
  fireEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
  expect(await screen.findByText('Записей еды: 0')).toBeVisible()
  expect(await db.foodEntries.count()).toBe(1)
})

it('связывает ошибку выбора и массы с полями, не создаёт запись', async () => {
  await openFood()
  fireEvent.click(screen.getByRole('button', { name: 'Добавить еду' }))
  expect(screen.getByLabelText('Продукт для записи')).toHaveFocus()
  expect(screen.getByLabelText('Продукт для записи')).toHaveAttribute('aria-invalid', 'true')
  save('0')
  expect(screen.getByLabelText('Масса порции, г')).toHaveAccessibleDescription('Порция должна быть больше нуля')
  expect(screen.getByLabelText('Масса порции, г')).toHaveFocus()
  expect(await db.foodEntries.count()).toBe(0)
})

it('сохраняет ввод для повторения при ошибке хранилища', async () => {
  await openFood()
  vi.spyOn(repository, 'addFood').mockRejectedValueOnce(Object.assign(new Error('synthetic'), { name: 'QuotaExceededError' }))
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByLabelText('Масса порции, г')).toHaveValue('150,5')
  fireEvent.click(screen.getByRole('button', { name: 'Добавить еду' }))
  expect(await screen.findByText('Записей еды: 1')).toBeVisible()
})

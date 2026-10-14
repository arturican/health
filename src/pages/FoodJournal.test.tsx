import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { addFood } from '../data/foodRepository'
import { FoodJournal } from './FoodJournal'
import { DayProvider } from '../ui/DayContext'

const product = { id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт', source: 'Тестовая этикетка', kcal: 250, protein: 12, fat: null, carbs: 0, archived: false }
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await Promise.all([db.foodEntries.clear(), db.products.clear()])
  await db.products.put(product)
})
afterEach(async () => {
  cleanup()
  await Promise.all([db.foodEntries.clear(), db.products.clear()])
  vi.useRealTimers()
})
async function openJournal() {
  const entry = await addFood({ date: '2026-10-14', productId: product.id, meal: 'lunch', grams: 150, note: 'Тестовая порция' })
  render(<DayProvider><FoodJournal /></DayProvider>)
  await screen.findByRole('button', { name: 'Изменить запись еды 1: Синтетический продукт' })
  return entry
}

it('показывает порцию, правит архивную запись и отменяет несохранённую правку', async () => {
  const entry = await openJournal()
  expect(screen.getByText('Обед · 150 г · 375 ккал')).toBeVisible()
  await db.products.put({ ...product, archived: true, kcal: 100 })
  fireEvent.click(screen.getByRole('button', { name: 'Изменить запись еды 1: Синтетический продукт' }))
  expect(await screen.findByRole('form', { name: 'Редактирование еды' })).toBeVisible()
  expect(screen.getByLabelText('Масса порции, г')).toHaveValue('150')
  expect(screen.getByLabelText('Приём пищи')).toHaveValue('lunch')
  expect(screen.queryByLabelText('Продукт для записи')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Масса порции, г'), { target: { value: '200,5' } })
  fireEvent.change(screen.getByLabelText('Приём пищи'), { target: { value: 'dinner' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить запись еды' }))
  expect(await screen.findByText('Запись еды изменена')).toBeVisible()
  expect(await screen.findByText('Ужин · 200,5 г · 501,3 ккал')).toBeVisible()
  expect(await db.foodEntries.get(entry.id)).toMatchObject({ grams: 200.5, meal: 'dinner', snapshot: entry.snapshot })
  fireEvent.click(screen.getByRole('button', { name: 'Изменить запись еды 1: Синтетический продукт' }))
  await screen.findByRole('form', { name: 'Редактирование еды' })
  fireEvent.change(screen.getByLabelText('Масса порции, г'), { target: { value: '999' } })
  fireEvent.click(screen.getByRole('button', { name: 'Отменить правку еды' }))
  expect((await db.foodEntries.get(entry.id))?.grams).toBe(200.5)
})

it('связывает ошибки массы и будущей даты с полями без изменения записи', async () => {
  const entry = await openJournal()
  fireEvent.click(screen.getByRole('button', { name: 'Изменить запись еды 1: Синтетический продукт' }))
  await screen.findByRole('form', { name: 'Редактирование еды' })
  fireEvent.change(screen.getByLabelText('Дата записи еды'), { target: { value: '2026-10-15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить запись еды' }))
  expect(screen.getByLabelText('Дата записи еды')).toHaveAccessibleDescription('Дата записи еды не может быть в будущем')
  expect(screen.getByLabelText('Дата записи еды')).toHaveFocus()
  expect(await db.foodEntries.get(entry.id)).toEqual(entry)
})

it('удаляет после подтверждения, отмена сохраняет запись и её продукт', async () => {
  const entry = await openJournal()
  fireEvent.click(screen.getByRole('button', { name: 'Удалить запись еды 1: Синтетический продукт' }))
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(await db.foodEntries.get(entry.id)).toEqual(entry)
  fireEvent.click(screen.getByRole('button', { name: 'Удалить запись еды 1: Синтетический продукт' }))
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  expect(await screen.findByText('Запись еды удалена')).toBeVisible()
  await waitFor(() => { expect(screen.queryByRole('list', { name: 'Еда выбранного дня' })).not.toBeInTheDocument() })
  expect(screen.getByText('За этот день нет записей еды.')).toBeVisible()
  expect(await db.products.count()).toBe(1)
})

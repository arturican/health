import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as foodRepository from '../data/foodRepository'
import * as weightRepository from '../data/weightRepository'
import { DayProvider } from '../ui/DayContext'
import { FoodJournal } from './FoodJournal'
import { WeightPage } from './WeightPage'

const weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-12', kg: 70 }
const product = { id: '00000000-0000-4000-8000-000000000002', name: 'Тестовая крупа', source: 'Синтетическая этикетка', kcal: 250, protein: null, fat: null, carbs: null, archived: false }
const weightEdit = 'Изменить вес за 12.10.2026'
const weightDelete = 'Удалить вес за 12.10.2026'
const foodEdit = 'Изменить запись еды 1: Тестовая крупа'
const foodDelete = 'Удалить запись еды 1: Тестовая крупа'

async function clearRecords() {
  await Promise.all([db.profiles.clear(), db.weights.clear(), db.products.clear(), db.foodEntries.clear()])
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await clearRecords()
  await db.profiles.put({ id: 'self', name: '', heightCm: 170, birthDate: '2000-01-01', formulaSex: 'none' })
  await db.weights.put(weight)
  await db.products.put(product)
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await clearRecords()
  vi.useRealTimers()
})

function click(name: string) {
  const button = screen.getByRole('button', { name })
  button.focus()
  fireEvent.click(button)
}
async function expectFieldFocus(label: string, phase = label) {
  await waitFor(() => { expect(screen.getByLabelText(label), phase).toHaveFocus() })
}
async function openFood() {
  const entry = await foodRepository.addFood({ date: '2026-10-14', productId: product.id, meal: 'lunch', grams: 150, note: 'Тестовая порция' })
  render(<DayProvider><FoodJournal /></DayProvider>)
  await screen.findByRole('form', { name: 'Добавление еды' })
  await screen.findByRole('button', { name: foodEdit })
  return entry
}

it('возвращает фокус веса после отмены, сохранения и удаления, направляет правку на дату', async () => {
  render(<WeightPage />)
  await screen.findByRole('button', { name: weightEdit })
  click(weightEdit)
  await expectFieldFocus('Дата измерения', 'Начало правки веса')
  const kg = screen.getByLabelText('Вес, кг')
  fireEvent.change(kg, { target: { value: '70,75' } })
  kg.focus()
  click(weightEdit)
  await expectFieldFocus('Дата измерения', 'Повторный выбор редактируемого веса')
  expect(screen.getByLabelText('Вес, кг')).toHaveValue('70,75')
  click('Отменить изменение')
  await expectFieldFocus('Вес, кг', 'Отмена правки веса')
  click(weightEdit)
  fireEvent.change(screen.getByLabelText('Вес, кг'), { target: { value: '71,25' } })
  click('Сохранить вес')
  await screen.findByText('71,25 кг')
  await expectFieldFocus('Вес, кг', 'Сохранение правки веса')
  expect(await db.weights.get(weight.id)).toMatchObject({ kg: 71.25 })
  click(weightDelete)
  click('Подтвердить удаление')
  await screen.findByText(/Измерений пока нет/)
  await expectFieldFocus('Вес, кг', 'Удаление веса')
  expect(await db.weights.count()).toBe(0)
})

it('оставляет вес и диалог при отказе удаления, фокусирует отмену и допускает повтор', async () => {
  render(<WeightPage />)
  await screen.findByRole('button', { name: weightDelete })
  vi.spyOn(weightRepository, 'deleteWeight').mockRejectedValueOnce(Object.assign(new Error('synthetic private detail'), { name: 'QuotaExceededError' }))
  click(weightDelete)
  click('Подтвердить удаление')
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('alertdialog')).toBeVisible()
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus() })
  expect(await db.weights.get(weight.id)).toEqual(weight)
  click('Подтвердить удаление')
  await screen.findByText(/Измерений пока нет/)
  await expectFieldFocus('Вес, кг')
})

it('фокусирует продукт после добавления и правки, сохраняет новый черновик при удалении строки', async () => {
  render(<DayProvider><FoodJournal /></DayProvider>)
  await screen.findByRole('form', { name: 'Добавление еды' })
  fireEvent.change(screen.getByLabelText('Продукт для записи'), { target: { value: product.id } })
  fireEvent.change(screen.getByLabelText('Масса порции, г'), { target: { value: '125' } })
  click('Добавить еду')
  await screen.findByRole('button', { name: foodEdit })
  await expectFieldFocus('Продукт для записи')
  click(foodEdit)
  await screen.findByRole('form', { name: 'Редактирование еды' })
  click('Отменить правку еды')
  await expectFieldFocus('Продукт для записи')
  click(foodEdit)
  await screen.findByRole('form', { name: 'Редактирование еды' })
  fireEvent.change(screen.getByLabelText('Масса порции, г'), { target: { value: '130' } })
  click('Сохранить запись еды')
  await screen.findByText('Запись еды изменена')
  await expectFieldFocus('Продукт для записи')
  fireEvent.change(screen.getByLabelText('Продукт для записи'), { target: { value: product.id } })
  fireEvent.change(screen.getByLabelText('Масса порции, г'), { target: { value: '77,5' } })
  fireEvent.change(screen.getByLabelText('Комментарий к еде (необязательно)'), { target: { value: 'Новый синтетический черновик' } })
  click(foodDelete)
  click('Отмена')
  await waitFor(() => { expect(screen.getByRole('button', { name: foodDelete })).toHaveFocus() })
  click(foodDelete)
  click('Подтвердить удаление')
  await screen.findByText('За этот день нет записей еды.')
  await expectFieldFocus('Продукт для записи')
  expect(screen.getByLabelText('Продукт для записи')).toHaveValue(product.id)
  expect(screen.getByLabelText('Масса порции, г')).toHaveValue('77,5')
  expect(screen.getByLabelText('Комментарий к еде (необязательно)')).toHaveValue('Новый синтетический черновик')
  expect(await db.foodEntries.count()).toBe(0)
})

it('возвращает фокус к заголовку еды после отмены правки и удаления без активного продукта', async () => {
  await foodRepository.addFood({ date: '2026-10-14', productId: product.id, meal: 'lunch', grams: 150, note: '' })
  await db.products.put({ ...product, archived: true })
  render(<DayProvider><FoodJournal /></DayProvider>)
  await screen.findByRole('button', { name: foodEdit })
  click(foodEdit)
  await screen.findByRole('form', { name: 'Редактирование еды' })
  click('Отменить правку еды')
  await waitFor(() => { expect(screen.getByRole('heading', { name: 'Запись еды' })).toHaveFocus() })
  expect(screen.queryByLabelText('Продукт для записи')).not.toBeInTheDocument()
  click(foodDelete)
  click('Подтвердить удаление')
  await screen.findByText('За этот день нет записей еды.')
  await waitFor(() => { expect(screen.getByRole('heading', { name: 'Запись еды' })).toHaveFocus() })
})

it('при отказе удаления еды сохраняет запись, диалог и новый ввод, возвращает фокус отмене', async () => {
  const entry = await openFood()
  vi.spyOn(foodRepository, 'deleteFood').mockRejectedValueOnce(Object.assign(new Error('synthetic private detail'), { name: 'QuotaExceededError' }))
  fireEvent.change(screen.getByLabelText('Масса порции, г'), { target: { value: '40' } })
  click(foodDelete)
  click('Подтвердить удаление')
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('alertdialog')).toBeVisible()
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus() })
  expect(screen.getByLabelText('Масса порции, г')).toHaveValue('40')
  expect(await db.foodEntries.get(entry.id)).toEqual(entry)
  click('Подтвердить удаление')
  await screen.findByText('За этот день нет записей еды.')
  await expectFieldFocus('Продукт для записи')
  expect(screen.getByLabelText('Масса порции, г')).toHaveValue('40')
})

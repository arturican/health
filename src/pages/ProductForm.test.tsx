import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as repository from '../data/productRepository'
import { NutritionPage } from './NutritionPage'

beforeEach(async () => { await Promise.all([db.products.clear(), db.metadata.clear()]) })
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all([db.products.clear(), db.metadata.clear()])
})

function save(name = 'Синтетический продукт', kcal = '150,5') {
  fireEvent.change(screen.getByLabelText('Название продукта'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Калории на 100 г, ккал'), { target: { value: kcal } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить продукт' }))
}

it('создаёт продукт с неизвестными БЖУ, явно введённым нулём и источником', async () => {
  render(<NutritionPage />)
  await screen.findByText('Активных продуктов: 0')
  fireEvent.change(screen.getByLabelText('Жиры на 100 г, г (необязательно)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Источник (необязательно)'), { target: { value: '  Тестовая этикетка  ' } })
  save()
  expect(await screen.findByText('Продукт сохранён')).toBeVisible()
  expect(await screen.findByText('Активных продуктов: 1')).toBeVisible()
  expect(await db.products.toArray()).toEqual([expect.objectContaining({ name: 'Синтетический продукт', kcal: 150.5, protein: null, fat: 0, carbs: null, source: 'Тестовая этикетка', archived: false })])
  await waitFor(() => { expect(screen.getByLabelText('Название продукта')).toHaveValue('') })
})

it('показывает ошибку и фокус, не записывает неизвестные или неверные данные', async () => {
  render(<NutritionPage />)
  save('', '-1')
  expect(screen.getByRole('alert')).toHaveTextContent('Проверьте отмеченные поля')
  expect(screen.getByLabelText('Название продукта')).toHaveFocus()
  expect(await db.products.count()).toBe(0)
  fireEvent.change(screen.getByLabelText('Белки на 100 г, г (необязательно)'), { target: { value: '101' } })
  save()
  expect(screen.getByLabelText('Белки на 100 г, г (необязательно)')).toHaveAccessibleDescription('Проверьте значение на 100 г')
  expect(screen.getByLabelText('Белки на 100 г, г (необязательно)')).toHaveFocus()
  expect(await db.products.count()).toBe(0)
})

it('добавляет примеры явным действием и не дублирует их', async () => {
  render(<NutritionPage />)
  expect(await screen.findByText('Активных продуктов: 0')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Добавить примеры продуктов' }))
  expect(await screen.findByText('Активных продуктов: 2')).toBeVisible()
  expect(screen.getByText('Примеры добавлены')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Добавить примеры продуктов' }))
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Добавить примеры продуктов' })).toBeEnabled() })
  expect(await db.products.count()).toBe(2)
})

it('оставляет ввод после ошибки хранилища и позволяет повторить сохранение', async () => {
  vi.spyOn(repository, 'addProduct').mockRejectedValueOnce(Object.assign(new Error('synthetic details'), { name: 'QuotaExceededError' }))
  render(<NutritionPage />)
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByLabelText('Название продукта')).toHaveValue('Синтетический продукт')
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить продукт' }))
  expect(await screen.findByText('Продукт сохранён')).toBeVisible()
})

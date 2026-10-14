import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import '../styles.css'

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans], async () => {
    await db.metadata.clear()
    await db.energyPlans.clear()
    await db.workouts.clear()
    await db.steps.clear()
    await db.foodEntries.clear()
    await db.nutritionDays.clear()
    await db.products.clear()
    await db.weights.clear()
    await db.profiles.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
}

beforeEach(async () => {
  await resetTestState()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})

afterEach(async () => {
  await resetTestState()
  vi.useRealTimers()
})

test('профиль создаётся через браузер после исправления ошибок и сохраняется при повторном открытии', async () => {
  const screen = await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible()
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect.element(page.getByRole('form', { name: 'Создание профиля' })).toBeVisible()
  expect(window.location.hash).toBe('#profile')
  expect((await axe.run(screen.container)).violations).toEqual([])

  await page.getByRole('button', { name: 'Создать профиль' }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Проверьте отмеченные поля.')
  await expect.element(page.getByLabelText('Рост, см')).toHaveFocus()
  await expect.element(page.getByLabelText('Рост, см')).toHaveAttribute('aria-invalid', 'true')
  await expect.element(page.getByLabelText('Вес, кг')).toHaveAttribute('aria-invalid', 'true')
  expect(await db.profiles.count()).toBe(0)
  expect(await db.weights.count()).toBe(0)
  expect((await axe.run(screen.container)).violations).toEqual([])

  await page.getByLabelText('Имя (необязательно)').fill('Тестовый профиль')
  await page.getByLabelText('Рост, см').fill('171,5')
  await page.getByLabelText('Дата рождения (необязательно)').fill('2000-02-29')
  await page.getByLabelText('Пол для формулы расхода (необязательно)').selectOptions('male')
  await page.getByLabelText('Вес, кг').fill('68.25')
  await page.getByLabelText('Дата первого измерения').fill('2026-10-01')
  await page.getByRole('button', { name: 'Создать профиль' }).click()

  await expect.element(page.getByRole('status')).toHaveTextContent('Профиль и первое измерение сохранены')
  await expect.element(page.getByText('Тестовый профиль', { exact: true })).toBeVisible()
  await expect.element(page.getByText('171,5 см', { exact: true })).toBeVisible()
  await expect.element(page.getByText('29.02.2000', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Мужской', { exact: true })).toBeVisible()
  await expect.element(page.getByRole('form', { name: 'Создание профиля' })).not.toBeInTheDocument()
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  expect(await db.profiles.toArray()).toEqual([{
    id: 'self', name: 'Тестовый профиль', heightCm: 171.5, birthDate: '2000-02-29', formulaSex: 'male',
  }])
  const weights = await db.weights.toArray()
  expect(weights).toHaveLength(1)
  expect(weights[0]).toMatchObject({ date: '2026-10-01', kg: 68.25 })
  expect((await axe.run(screen.container)).violations).toEqual([])

  await screen.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()
  await expect.element(page.getByText('Тестовый профиль', { exact: true })).toBeVisible()
  await expect.element(page.getByText('171,5 см', { exact: true })).toBeVisible()
  await expect.element(page.getByRole('form', { name: 'Создание профиля' })).not.toBeInTheDocument()
  expect(await db.profiles.count()).toBe(1)
  expect(await db.weights.toArray()).toEqual(weights)

  await page.getByRole('button', { name: 'Редактировать профиль' }).click()
  await expect.element(page.getByRole('form', { name: 'Редактирование профиля' })).toBeVisible()
  await expect.element(page.getByLabelText('Имя (необязательно)')).toHaveValue('Тестовый профиль')
  await expect.element(page.getByLabelText('Рост, см')).toHaveValue('171.5')
  await expect.element(page.getByLabelText('Дата рождения (необязательно)')).toHaveValue('2000-02-29')
  await expect.element(page.getByLabelText('Пол для формулы расхода (необязательно)')).toHaveValue('male')
  await expect.element(page.getByLabelText('Вес, кг')).not.toBeInTheDocument()
  await expect.element(page.getByLabelText('Дата первого измерения')).not.toBeInTheDocument()
  expect((await axe.run(reopened.container)).violations).toEqual([])

  await page.getByLabelText('Дата рождения (необязательно)').fill('2026-10-02')
  await page.getByRole('button', { name: 'Сохранить профиль' }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Дата рождения позже сохранённого измерения')
  expect(await db.profiles.toArray()).toEqual([{
    id: 'self', name: 'Тестовый профиль', heightCm: 171.5, birthDate: '2000-02-29', formulaSex: 'male',
  }])
  expect(await db.weights.toArray()).toEqual(weights)

  await page.getByLabelText('Имя (необязательно)').fill('')
  await page.getByLabelText('Рост, см').fill('172,75')
  await page.getByLabelText('Дата рождения (необязательно)').fill('')
  await page.getByLabelText('Пол для формулы расхода (необязательно)').selectOptions('none')
  await page.getByRole('button', { name: 'Сохранить профиль' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Профиль обновлён')
  await expect.element(page.getByText('172,75 см', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Не указано', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Не указана', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Не указан', { exact: true })).toBeVisible()
  await expect.element(page.getByRole('form', { name: 'Редактирование профиля' })).not.toBeInTheDocument()
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  const updatedProfile = [{ id: 'self', name: '', heightCm: 172.75, birthDate: null, formulaSex: 'none' }]
  expect(await db.profiles.toArray()).toEqual(updatedProfile)
  expect(await db.weights.toArray()).toEqual(weights)
  expect((await axe.run(reopened.container)).violations).toEqual([])

  await reopened.unmount()
  const editedScreen = await render(<App />)
  await expect.element(page.getByText('172,75 см', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Редактировать профиль' }).click()
  await expect.element(page.getByLabelText('Имя (необязательно)')).toHaveValue('')
  await expect.element(page.getByLabelText('Рост, см')).toHaveValue('172.75')
  await expect.element(page.getByLabelText('Дата рождения (необязательно)')).toHaveValue('')
  await expect.element(page.getByLabelText('Пол для формулы расхода (необязательно)')).toHaveValue('none')
  await page.getByLabelText('Имя (необязательно)').fill('Несохранённое тестовое имя')
  await page.getByLabelText('Рост, см').fill('199')
  await page.getByLabelText('Дата рождения (необязательно)').fill('1980-01-01')
  await page.getByLabelText('Пол для формулы расхода (необязательно)').selectOptions('female')
  await page.getByRole('button', { name: 'Отмена' }).click()
  await expect.element(page.getByText('172,75 см', { exact: true })).toBeVisible()
  await expect.element(page.getByRole('form', { name: 'Редактирование профиля' })).not.toBeInTheDocument()
  await expect.element(page.getByText('Несохранённое тестовое имя', { exact: true })).not.toBeInTheDocument()
  expect(await db.profiles.toArray()).toEqual(updatedProfile)
  expect(await db.weights.toArray()).toEqual(weights)
  expect((await axe.run(editedScreen.container)).violations).toEqual([])
})

import { afterEach, beforeEach, expect, test } from 'vitest'
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
  await db.transaction('rw', db.profiles, db.weights, async () => {
    await db.weights.clear()
    await db.profiles.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
}

beforeEach(async () => {
  await resetTestState()
})

afterEach(async () => {
  await resetTestState()
})

test('профиль создаётся через браузер после исправления ошибок и сохраняется при повторном открытии', async () => {
  const screen = await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
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
  await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()
  await expect.element(page.getByText('Тестовый профиль', { exact: true })).toBeVisible()
  await expect.element(page.getByText('171,5 см', { exact: true })).toBeVisible()
  await expect.element(page.getByRole('form', { name: 'Создание профиля' })).not.toBeInTheDocument()
  expect(await db.profiles.count()).toBe(1)
  expect(await db.weights.toArray()).toEqual(weights)
})

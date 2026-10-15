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
  const tables = [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans, db.files, db.photos, db.documents, db.labResults]
  await db.transaction('rw', tables, async () => { for (const table of tables) await table.clear() })
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
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})

test('исходные дроби и очень малые значения видны без потери точности после сохранения и повторного открытия', async () => {
  let view = await render(<App />)
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  await navigation.getByRole('link', { name: 'Профиль', exact: true }).click()
  await page.getByLabelText('Имя (необязательно)', { exact: true }).fill('Синтетический точный профиль')
  await page.getByLabelText('Рост, см', { exact: true }).fill('170,1234567')
  await page.getByLabelText('Вес, кг', { exact: true }).fill('70')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect.element(page.getByText('Синтетический точный профиль', { exact: true })).toBeVisible()
  expect(page.getByRole('region', { name: 'Профиль', exact: true }).element().textContent).toContain('170,1234567 см')
  await navigation.getByRole('link', { name: 'Питание', exact: true }).click()
  const productName = 'Синтетический точный продукт'
  const product = page.getByRole('form', { name: 'Новый продукт', exact: true })
  await product.getByLabelText('Название продукта', { exact: true }).fill(productName)
  await product.getByLabelText('Калории на 100 г, ккал', { exact: true }).fill('1,234567')
  await product.getByLabelText('Белки на 100 г, г (необязательно)', { exact: true }).fill('0,0000001')
  await product.getByLabelText('Углеводы на 100 г, г (необязательно)', { exact: true }).fill('0')
  await product.getByRole('button', { name: 'Сохранить продукт', exact: true }).click()
  const catalog = page.getByRole('list', { name: 'Каталог продуктов', exact: true })
  const preciseProduct = '1,234567 ккал/100 г · Белки: 0,0000001 г · Жиры: неизвестно · Углеводы: 0 г'
  await expect.element(catalog).toHaveTextContent(preciseProduct)
  const food = page.getByRole('form', { name: 'Добавление еды', exact: true })
  await food.getByLabelText('Продукт для записи', { exact: true }).selectOptions(page.getByRole('option', { name: productName, exact: true }))
  await food.getByLabelText('Масса порции, г', { exact: true }).fill('0,0000001')
  await food.getByRole('button', { name: 'Добавить еду', exact: true }).click()
  const journal = page.getByRole('list', { name: 'Еда выбранного дня', exact: true })
  await expect.element(journal).toHaveTextContent('Завтрак · 0,0000001 г · 0 ккал')
  await navigation.getByRole('link', { name: 'Активность', exact: true }).click()
  const workout = page.getByRole('form', { name: 'Добавление тренировки', exact: true })
  await workout.getByLabelText('Вид тренировки', { exact: true }).fill('Синтетическая точная тренировка')
  await workout.getByLabelText('Длительность, мин', { exact: true }).fill('0,0000001')
  await workout.getByLabelText('Ручная оценка расхода, ккал (необязательно)', { exact: true }).fill('1,234567')
  await workout.getByRole('button', { name: 'Добавить тренировку', exact: true }).click()
  const workouts = page.getByRole('list', { name: 'Тренировки выбранного дня', exact: true })
  const preciseWorkout = '0,0000001 мин. Ручная оценка: 1,234567 ккал'
  await expect.element(workouts).toHaveTextContent(preciseWorkout)
  await navigation.getByRole('link', { name: 'Сегодня', exact: true }).click()
  const activity = page.getByRole('region', { name: 'Активность за день', exact: true })
  await expect.element(activity).toHaveTextContent('1e-7 мин; ручная оценка: 1,234567 ккал')
  await view.unmount()
  view = await render(<App />)
  await expect.element(activity).toHaveTextContent('1e-7 мин; ручная оценка: 1,234567 ккал')
  await navigation.getByRole('link', { name: 'Активность', exact: true }).click()
  await expect.element(workouts).toHaveTextContent(preciseWorkout)
  await navigation.getByRole('link', { name: 'Питание', exact: true }).click()
  await expect.element(catalog).toHaveTextContent(preciseProduct)
  await expect.element(journal).toHaveTextContent('Завтрак · 0,0000001 г · 0 ккал')
  await navigation.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect.element(page.getByText('170,1234567 см', { exact: true })).toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

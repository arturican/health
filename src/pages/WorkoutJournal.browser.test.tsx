import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import '../styles.css'

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', [db.workouts, db.steps, db.foodEntries, db.products, db.nutritionDays, db.metadata], async () => {
    await db.workouts.clear()
    await db.steps.clear()
    await db.foodEntries.clear()
    await db.products.clear()
    await db.nutritionDays.clear()
    await db.metadata.clear()
  })
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
  await page.viewport(1280, 800)
  vi.useRealTimers()
})

test('журнал сохраняет несколько тренировок, различает неизвестный расход и ноль и сбрасывает черновик при смене дня', async () => {
  const steps = [{ date: '2026-10-01', count: 4321 }]
  await db.steps.bulkAdd(steps)
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  await page.getByLabelText('День дневника').fill('2026-10-01')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect.element(page.getByText('Шаги за этот день: 4 321', { exact: true })).toBeVisible()
  await expect.element(page.getByText('За этот день нет записей тренировок.', { exact: true })).toBeVisible()
  const form = page.getByRole('form', { name: 'Добавление тренировки', exact: true })
  const journal = page.getByRole('list', { name: 'Тренировки выбранного дня', exact: true })
  const add = form.getByRole('button', { name: 'Добавить тренировку', exact: true })
  const labels = ['Вид тренировки', 'Длительность, мин', 'Ручная оценка расхода, ккал (необязательно)', 'Источник оценки (необязательно)', 'Комментарий к тренировке (необязательно)']
  await add.click()
  await expect.element(form.getByLabelText('Вид тренировки')).toHaveFocus()
  await expect.element(form.getByLabelText('Вид тренировки')).toHaveAccessibleDescription('Укажите вид тренировки')
  await expect.element(form.getByLabelText('Длительность, мин')).toHaveAttribute('aria-invalid', 'true')
  expect(await db.workouts.count()).toBe(0)
  await form.getByLabelText('Вид тренировки').fill('  Синтетическая прогулка  ')
  await form.getByLabelText('Длительность, мин').fill('30,5')
  await form.getByLabelText('Источник оценки (необязательно)').fill('  Синтетический источник  ')
  await form.getByLabelText('Комментарий к тренировке (необязательно)').fill('  Синтетический комментарий  ')
  await userEvent.keyboard('{Tab}')
  await expect.element(add).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('status').filter({ hasText: 'Тренировка добавлена' })).toHaveTextContent('Тренировка добавлена')
  await expect.element(journal.getByText('Синтетическая прогулка', { exact: true })).toBeVisible()
  await expect.element(journal.getByText('30,5 мин. Расход: нет данных', { exact: true })).toBeVisible()
  await expect.element(journal.getByText('Источник: Синтетический источник', { exact: true })).toBeVisible()
  await expect.element(journal.getByText('Синтетический комментарий', { exact: true })).toBeVisible()
  for (const label of labels) await expect.element(form.getByLabelText(label, { exact: true })).toHaveValue('')
  await expect.element(form.getByLabelText('Вид тренировки')).toHaveFocus()
  const first = await db.workouts.toArray()
  expect(first).toEqual([expect.objectContaining({
    date: '2026-10-01', kind: 'Синтетическая прогулка', minutes: 30.5, kcal: null,
    source: 'Синтетический источник', note: 'Синтетический комментарий',
  })])

  await form.getByLabelText('Вид тренировки').fill('Синтетическая тренировка с нулём')
  await form.getByLabelText('Длительность, мин').fill('1,25')
  await form.getByLabelText('Ручная оценка расхода, ккал (необязательно)').fill('0')
  await add.click()
  await expect.element(journal.getByText('1,25 мин. Ручная оценка: 0 ккал', { exact: true })).toBeVisible()
  const originalDay = await db.workouts.toArray()
  expect(originalDay).toHaveLength(2)
  expect(originalDay).toEqual(expect.arrayContaining(first))
  expect(originalDay).toEqual(expect.arrayContaining([expect.objectContaining({
    date: '2026-10-01', kind: 'Синтетическая тренировка с нулём', minutes: 1.25, kcal: 0, source: '', note: '',
  })]))
  for (const label of labels) await expect.element(form.getByLabelText(label, { exact: true })).toHaveValue('')
  for (const [index, label] of labels.entries()) await form.getByLabelText(label, { exact: true }).fill(index === 0 ? 'Несохранённая синтетическая тренировка' : '99')
  await page.getByLabelText('День дневника').fill('2026-10-02')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect.element(page.getByText('За этот день нет записей тренировок.', { exact: true })).toBeVisible()
  await expect.element(journal).not.toBeInTheDocument()
  for (const label of labels) await expect.element(form.getByLabelText(label, { exact: true })).toHaveValue('')
  expect(await db.workouts.toArray()).toEqual(originalDay)
  await form.getByLabelText('Вид тренировки').fill('Синтетическая разминка')
  await form.getByLabelText('Длительность, мин').fill('10')
  await add.click()
  await expect.element(journal.getByText('Синтетическая разминка', { exact: true })).toBeVisible()
  await expect.element(journal.getByText('10 мин. Расход: нет данных', { exact: true })).toBeVisible()
  const saved = await db.workouts.toArray()
  expect(saved).toHaveLength(3)
  expect(saved).toEqual(expect.arrayContaining(originalDay))
  expect(saved).toEqual(expect.arrayContaining([expect.objectContaining({
    date: '2026-10-02', kind: 'Синтетическая разминка', minutes: 10, kcal: null, source: '', note: '',
  })]))
  expect(await db.steps.toArray()).toEqual(steps)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  await expect.element(page.getByLabelText('День дневника')).toHaveValue('2026-10-02')
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  await expect.element(journal.getByText('Синтетическая разминка', { exact: true })).toBeVisible()

  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByLabelText('День дневника')).toHaveValue('2026-10-14')
  await expect.element(page.getByText('За этот день нет записей тренировок.', { exact: true })).toBeVisible()
  await page.getByLabelText('День дневника').fill('2026-10-01')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect.element(journal.getByText('Синтетическая прогулка', { exact: true })).toBeVisible()
  await expect.element(journal.getByText('30,5 мин. Расход: нет данных', { exact: true })).toBeVisible()
  await expect.element(journal.getByText('1,25 мин. Ручная оценка: 0 ккал', { exact: true })).toBeVisible()
  await expect.element(journal.getByText('Синтетическая разминка', { exact: true })).not.toBeInTheDocument()
  await expect.element(page.getByText('Шаги за этот день: 4 321', { exact: true })).toBeVisible()
  expect(await db.workouts.toArray()).toEqual(saved)
  expect(await db.steps.toArray()).toEqual(steps)
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

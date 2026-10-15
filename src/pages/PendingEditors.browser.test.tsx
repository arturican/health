import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import { addFood } from '../data/foodRepository'
import '../styles.css'

const firstProduct = { id: '00000000-0000-4000-8000-000000000071', name: 'Синтетический продукт А', source: '', kcal: 100, protein: null, fat: 0, carbs: null, archived: false }
const secondProduct = { ...firstProduct, id: '00000000-0000-4000-8000-000000000072', name: 'Синтетический продукт Б' }
async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear() })
  window.history.replaceState(null, '', window.location.pathname)
}
beforeEach(async () => {
  await resetTestState()
  await page.viewport(375, 812)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
  await db.products.bulkAdd([firstProduct, secondProduct])
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

test('нативный отказ записи еды сохраняет редактор А и блокирует действия Б до завершения', async () => {
  const first = await addFood({ date: '2026-10-14', productId: firstProduct.id, meal: 'breakfast', grams: 100, note: 'Синтетическая порция А' })
  const second = await addFood({ date: '2026-10-14', productId: secondProduct.id, meal: 'breakfast', grams: 200, note: 'Синтетическая порция Б' })
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  const journal = page.getByRole('list', { name: 'Еда выбранного дня', exact: true })
  const firstRow = journal.getByRole('listitem').filter({ hasText: 'Синтетическая порция А' })
  const secondRow = journal.getByRole('listitem').filter({ hasText: 'Синтетическая порция Б' })
  await firstRow.getByRole('button', { name: /^Изменить запись еды/ }).click()
  const form = page.getByRole('form', { name: 'Редактирование еды', exact: true })
  const grams = form.getByLabelText('Масса порции, г', { exact: true })
  const note = form.getByLabelText('Комментарий к еде (необязательно)', { exact: true })
  await grams.fill('125,5')
  await note.fill('Синтетический черновик А')
  let locked = false
  let release = false
  const lock = db.transaction('rw', db.foodEntries, async () => { locked = true; while (!release) await db.foodEntries.count() })
  await expect.poll(() => locked).toBe(true)
  const failure = () => { throw new DOMException('synthetic-private-native-food', 'QuotaExceededError') }
  db.foodEntries.hook('updating', failure)
  try {
    try {
      await form.getByRole('button', { name: 'Сохранить запись еды', exact: true }).click()
      await expect.element(form.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled()
      await expect.element(secondRow.getByRole('button', { name: /^Изменить запись еды/ })).toBeDisabled()
      await expect.element(secondRow.getByRole('button', { name: /^Удалить запись еды/ })).toBeDisabled()
      await expect.element(form.getByRole('button', { name: 'Отменить правку еды', exact: true })).toBeDisabled()
      await userEvent.keyboard('{Enter}')
    } finally { release = true; await lock }
    await expect.element(page.getByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    await expect.element(page.getByRole('alert')).not.toHaveTextContent('synthetic-private-native-food')
    await expect.element(grams).toHaveValue('125,5')
    await expect.element(note).toHaveValue('Синтетический черновик А')
    expect(await db.foodEntries.get(first.id)).toEqual(first)
    expect(await db.foodEntries.get(second.id)).toEqual(second)
  } finally { db.foodEntries.hook('updating').unsubscribe(failure) }
  await form.getByRole('button', { name: 'Сохранить запись еды', exact: true }).click()
  await expect.element(page.getByText('Запись еды изменена', { exact: true })).toBeVisible()
  expect(await db.foodEntries.get(first.id)).toMatchObject({ grams: 125.5, note: 'Синтетический черновик А' })
  expect(await db.foodEntries.get(second.id)).toEqual(second)
  await expect.element(secondRow.getByRole('button', { name: /^Изменить запись еды/ })).toBeEnabled()
  await secondRow.getByRole('button', { name: /^Изменить запись еды/ }).click()
  await expect.element(grams).toHaveValue('200')
  await expect.element(note).toHaveValue('Синтетическая порция Б')
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

test('нативный отказ записи продукта сохраняет поля А и блокирует правку и архив Б до повтора', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  await page.getByRole('button', { name: `Править продукт ${firstProduct.name}`, exact: true }).click()
  const form = page.getByRole('form', { name: 'Редактирование продукта', exact: true })
  const calories = form.getByLabelText('Калории на 100 г, ккал', { exact: true })
  const source = form.getByLabelText('Источник (необязательно)', { exact: true })
  await calories.fill('125,5')
  await source.fill('Синтетическая новая этикетка')
  let locked = false
  let release = false
  const lock = db.transaction('rw', db.products, async () => { locked = true; while (!release) await db.products.count() })
  await expect.poll(() => locked).toBe(true)
  const failure = () => { throw new DOMException('synthetic-private-native-product', 'QuotaExceededError') }
  db.products.hook('updating', failure)
  try {
    try {
      await form.getByRole('button', { name: 'Сохранить продукт', exact: true }).click()
      await expect.element(form.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled()
      await expect.element(page.getByRole('button', { name: `Править продукт ${secondProduct.name}`, exact: true })).toBeDisabled()
      await expect.element(page.getByRole('button', { name: `Архивировать продукт ${secondProduct.name}`, exact: true })).toBeDisabled()
      await expect.element(form.getByRole('button', { name: 'Отменить правку продукта', exact: true })).toBeDisabled()
      await userEvent.keyboard('{Enter}')
    } finally { release = true; await lock }
    await expect.element(page.getByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    await expect.element(page.getByRole('alert')).not.toHaveTextContent('synthetic-private-native-product')
    await expect.element(calories).toHaveValue('125,5')
    await expect.element(source).toHaveValue('Синтетическая новая этикетка')
    expect(await db.products.toArray()).toEqual([firstProduct, secondProduct])
  } finally { db.products.hook('updating').unsubscribe(failure) }
  await form.getByRole('button', { name: 'Сохранить продукт', exact: true }).click()
  await expect.element(page.getByText('Продукт обновлён', { exact: true })).toBeVisible()
  expect(await db.products.get(firstProduct.id)).toEqual({ ...firstProduct, kcal: 125.5, source: 'Синтетическая новая этикетка' })
  expect(await db.products.get(secondProduct.id)).toEqual(secondProduct)
  await expect.element(page.getByRole('button', { name: `Править продукт ${secondProduct.name}`, exact: true })).toBeEnabled()
  await page.getByRole('button', { name: `Править продукт ${secondProduct.name}`, exact: true }).click()
  await expect.element(form.getByLabelText('Название продукта', { exact: true })).toHaveValue(secondProduct.name)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import '../styles.css'

vi.mock('../domain/backup', async importOriginal => ({ ...await importOriginal<typeof import('../domain/backup')>(), BACKUP_MAX_RECORDS: 3 }))

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
async function createProduct(name: string) {
  const form = page.getByRole('form', { name: 'Новый продукт', exact: true })
  await form.getByLabelText('Название продукта', { exact: true }).fill(name)
  await form.getByLabelText('Калории на 100 г, ккал', { exact: true }).fill('100')
  await form.getByRole('button', { name: 'Сохранить продукт', exact: true }).click()
  await expect.element(page.getByRole('button', { name: `Править продукт ${name}`, exact: true })).toBeVisible()
  await expect.element(form.getByLabelText('Название продукта', { exact: true })).toHaveValue('')
}
const limitError = 'Достигнут лимит записей раздела (3). Новые записи не сохранены.'

test('лимит каталога сохраняет черновик, учитывает архив и разрешает правку существующей записи', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить примеры продуктов', exact: true }).click()
  await expect.element(page.getByText('Активных продуктов: 2', { exact: true })).toBeVisible()
  const thirdName = 'Синтетический третий продукт'
  await createProduct(thirdName)
  await expect.element(page.getByText('Активных продуктов: 3', { exact: true })).toBeVisible()
  const before = await db.products.toArray()
  const third = before.find(product => product.name === thirdName)
  if (!third) throw new Error('Нужен третий продукт, созданный через форму')
  const form = page.getByRole('form', { name: 'Новый продукт', exact: true })
  await form.getByLabelText('Название продукта', { exact: true }).fill('Синтетический четвёртый черновик')
  await form.getByLabelText('Калории на 100 г, ккал', { exact: true }).fill('125,5')
  await form.getByLabelText('Белки на 100 г, г (необязательно)', { exact: true }).fill('1,25')
  await form.getByLabelText('Жиры на 100 г, г (необязательно)', { exact: true }).fill('0')
  await form.getByLabelText('Углеводы на 100 г, г (необязательно)', { exact: true }).fill('3,75')
  await form.getByLabelText('Источник (необязательно)', { exact: true }).fill('Синтетическая этикетка четвёртого продукта')
  await form.getByRole('button', { name: 'Сохранить продукт', exact: true }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent(limitError)
  expect(await db.products.toArray()).toEqual(before)
  await expect.element(form.getByLabelText('Название продукта', { exact: true })).toHaveValue('Синтетический четвёртый черновик')
  await expect.element(form.getByLabelText('Калории на 100 г, ккал', { exact: true })).toHaveValue('125,5')
  await expect.element(form.getByLabelText('Белки на 100 г, г (необязательно)', { exact: true })).toHaveValue('1,25')
  await expect.element(form.getByLabelText('Жиры на 100 г, г (необязательно)', { exact: true })).toHaveValue('0')
  await expect.element(form.getByLabelText('Углеводы на 100 г, г (необязательно)', { exact: true })).toHaveValue('3,75')
  await expect.element(form.getByLabelText('Источник (необязательно)', { exact: true })).toHaveValue('Синтетическая этикетка четвёртого продукта')
  await page.getByRole('button', { name: 'Архивировать продукт Пример: продукт А', exact: true }).click()
  await expect.element(page.getByText('Активных продуктов: 2', { exact: true })).toBeVisible()
  expect(await db.products.count()).toBe(3)
  const afterArchive = await db.products.toArray()
  await form.getByRole('button', { name: 'Сохранить продукт', exact: true }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent(limitError)
  expect(await db.products.toArray()).toEqual(afterArchive)
  await expect.element(form.getByLabelText('Название продукта', { exact: true })).toHaveValue('Синтетический четвёртый черновик')
  await page.getByRole('button', { name: `Править продукт ${thirdName}`, exact: true }).click()
  const editor = page.getByRole('form', { name: 'Редактирование продукта', exact: true })
  await editor.getByLabelText('Калории на 100 г, ккал', { exact: true }).fill('99,75')
  await editor.getByRole('button', { name: 'Сохранить продукт', exact: true }).click()
  await expect.element(page.getByText('Продукт обновлён', { exact: true })).toBeVisible()
  expect(await db.products.get(third.id)).toEqual({ ...third, kcal: 99.75 })
  expect(await db.products.count()).toBe(3)
  await page.getByLabelText('Показать архив', { exact: true }).click()
  await page.getByRole('button', { name: 'Вернуть продукт Пример: продукт А', exact: true }).click()
  await expect.element(page.getByText('Активных продуктов: 3', { exact: true })).toBeVisible()
  expect(await db.products.count()).toBe(3)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

test('нехватка места для двух примеров даёт видимую ошибку и не добавляет часть набора', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  await createProduct('Синтетический собственный продукт А')
  await createProduct('Синтетический собственный продукт Б')
  const before = await db.products.toArray()
  const form = page.getByRole('form', { name: 'Новый продукт', exact: true })
  await form.getByLabelText('Название продукта', { exact: true }).fill('Синтетический незавершённый продукт')
  await form.getByLabelText('Калории на 100 г, ккал', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Добавить примеры продуктов', exact: true }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent(limitError)
  await expect.element(page.getByText('Активных продуктов: 2', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Примеры добавлены', { exact: true })).not.toBeInTheDocument()
  await expect.element(form.getByLabelText('Название продукта', { exact: true })).toHaveValue('Синтетический незавершённый продукт')
  await expect.element(form.getByLabelText('Калории на 100 г, ккал', { exact: true })).toHaveValue('0')
  expect(await db.products.toArray()).toEqual(before)
  expect(await db.metadata.get('catalog-seeded')).toBeUndefined()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

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
  await db.transaction('rw', db.products, db.metadata, async () => {
    await db.products.clear()
    await db.metadata.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
}

beforeEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
})

afterEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
})

test('форма питания сохраняет свой продукт и добавляет примеры только по запросу', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  await expect.element(page.getByRole('form', { name: 'Новый продукт' })).toBeVisible()
  await expect.element(page.getByText('Активных продуктов: 0', { exact: true })).toBeVisible()
  expect(window.location.hash).toBe('#nutrition')
  expect(await db.metadata.count()).toBe(0)

  await page.getByRole('button', { name: 'Сохранить продукт' }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Проверьте отмеченные поля')
  await expect.element(page.getByLabelText('Название продукта')).toHaveFocus()
  await expect.element(page.getByLabelText('Название продукта')).toHaveAccessibleDescription('Введите название продукта')
  await expect.element(page.getByLabelText('Калории на 100 г, ккал')).toHaveAttribute('aria-invalid', 'true')
  expect(await db.products.count()).toBe(0)
  expect((await axe.run(view.container)).violations).toEqual([])

  await page.getByLabelText('Название продукта').fill('Синтетический продукт')
  await page.getByLabelText('Калории на 100 г, ккал').fill('150,5')
  await page.getByLabelText('Жиры на 100 г, г (необязательно)').fill('0')
  await page.getByLabelText('Источник (необязательно)').fill('  Синтетическая этикетка  ')
  await page.getByRole('button', { name: 'Сохранить продукт' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Продукт сохранён')
  await expect.element(page.getByText('Активных продуктов: 1', { exact: true })).toBeVisible()
  await expect.element(page.getByLabelText('Название продукта')).toHaveValue('')
  await expect.element(page.getByLabelText('Калории на 100 г, ккал')).toHaveValue('')
  const saved = await db.products.toArray()
  expect(saved).toEqual([expect.objectContaining({
    name: 'Синтетический продукт', source: 'Синтетическая этикетка',
    kcal: 150.5, protein: null, fat: 0, carbs: null, archived: false,
  })])

  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Питание' })).toBeVisible()
  await expect.element(page.getByText('Активных продуктов: 1', { exact: true })).toBeVisible()
  expect(await db.products.toArray()).toEqual(saved)
  expect(await db.metadata.count()).toBe(0)

  const seed = page.getByRole('button', { name: 'Добавить примеры продуктов' })
  await seed.click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Примеры добавлены')
  await expect.element(page.getByText('Активных продуктов: 3', { exact: true })).toBeVisible()
  const catalog = await db.products.toArray()
  expect(catalog.filter(product => product.name.startsWith('Пример:'))).toHaveLength(2)
  expect(catalog).toEqual(expect.arrayContaining(saved))
  await seed.click()
  await expect.element(seed).toBeEnabled()
  expect(await db.products.toArray()).toEqual(catalog)
  expect(await db.metadata.get('catalog-seeded')).toEqual({ id: 'catalog-seeded', value: 'done' })

  await page.viewport(375, 812)
  await expect.element(page.getByRole('form', { name: 'Новый продукт' })).toBeVisible()
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
}, 15000)

test('каталог ищет, правит и обратимо архивирует продукт на узком экране', async () => {
  await page.viewport(375, 812)
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  await expect.element(page.getByText('Активных продуктов: 0', { exact: true })).toBeVisible()
  const originalName = `Синтетический продукт ${'А'.repeat(90)}`
  const updatedName = `Обновлённый синтетический продукт ${'Б'.repeat(78)}`
  await page.getByLabelText('Название продукта').fill(originalName)
  await page.getByLabelText('Калории на 100 г, ккал').fill('150,5')
  await page.getByLabelText('Белки на 100 г, г (необязательно)').fill('8,5')
  await page.getByLabelText('Жиры на 100 г, г (необязательно)').fill('0')
  await page.getByLabelText('Источник (необязательно)').fill('Синтетическая этикетка')
  await page.getByRole('button', { name: 'Сохранить продукт' }).click()
  await expect.element(page.getByText(originalName, { exact: true })).toBeVisible()
  const saved = await db.products.toArray()
  expect(saved).toHaveLength(1)

  await page.getByLabelText('Поиск продукта').fill('  сИНТЕТИЧЕСКИЙ ПРОДУКТ  ')
  await expect.element(page.getByText(originalName, { exact: true })).toBeVisible()
  await page.getByLabelText('Поиск продукта').fill('Несуществующий учебный продукт')
  await expect.element(page.getByText('Продукты не найдены. Добавьте свой продукт или измените поиск.')).toBeVisible()
  await expect.element(page.getByText(originalName, { exact: true })).not.toBeInTheDocument()
  await page.getByLabelText('Поиск продукта').fill('')

  await page.getByRole('button', { name: `Править продукт ${originalName}`, exact: true }).click()
  await expect.element(page.getByRole('form', { name: 'Редактирование продукта' })).toBeVisible()
  await expect.element(page.getByLabelText('Название продукта')).toHaveValue(originalName)
  await expect.element(page.getByLabelText('Калории на 100 г, ккал')).toHaveValue('150.5')
  await expect.element(page.getByLabelText('Белки на 100 г, г (необязательно)')).toHaveValue('8.5')
  await expect.element(page.getByLabelText('Жиры на 100 г, г (необязательно)')).toHaveValue('0')
  await expect.element(page.getByLabelText('Углеводы на 100 г, г (необязательно)')).toHaveValue('')
  await expect.element(page.getByLabelText('Источник (необязательно)')).toHaveValue('Синтетическая этикетка')
  await page.getByLabelText('Название продукта').fill('Несохранённая синтетическая правка')
  await page.getByLabelText('Калории на 100 г, ккал').fill('999')
  await page.getByRole('button', { name: 'Отменить правку продукта' }).click()
  await expect.element(page.getByRole('form', { name: 'Новый продукт' })).toBeVisible()
  await expect.element(page.getByText(originalName, { exact: true })).toBeVisible()
  expect(await db.products.toArray()).toEqual(saved)

  await page.getByRole('button', { name: `Править продукт ${originalName}`, exact: true }).click()
  await page.getByLabelText('Название продукта').fill(updatedName)
  await page.getByLabelText('Калории на 100 г, ккал').fill('275,25')
  await page.getByRole('button', { name: 'Сохранить продукт' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Продукт обновлён')
  await expect.element(page.getByText(updatedName, { exact: true })).toBeVisible()
  await expect.element(page.getByText(originalName, { exact: true })).not.toBeInTheDocument()
  const updated = saved.map(product => ({ ...product, name: updatedName, kcal: 275.25 }))
  expect(await db.products.toArray()).toEqual(updated)

  await page.getByRole('button', { name: `Архивировать продукт ${updatedName}`, exact: true }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Продукт перемещён в архив')
  await expect.element(page.getByText(updatedName, { exact: true })).not.toBeInTheDocument()
  await expect.element(page.getByText('Активных продуктов: 0', { exact: true })).toBeVisible()
  expect(await db.products.toArray()).toEqual(updated.map(product => ({ ...product, archived: true })))
  await page.getByRole('checkbox', { name: 'Показать архив' }).click()
  await expect.element(page.getByText(updatedName, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Вернуть продукт ${updatedName}`, exact: true }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Продукт возвращён из архива')
  await page.getByRole('checkbox', { name: 'Показать архив' }).click()
  await expect.element(page.getByText(updatedName, { exact: true })).toBeVisible()
  expect(await db.products.toArray()).toEqual(updated)

  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByText('Активных продуктов: 1', { exact: true })).toBeVisible()
  await expect.element(page.getByText(updatedName, { exact: true })).toBeVisible()
  await expect.element(page.getByRole('checkbox', { name: 'Показать архив' })).not.toBeChecked()
  expect(await db.products.toArray()).toEqual(updated)
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
}, 15000)

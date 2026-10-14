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
  await db.transaction('rw', [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans, db.files, db.photos], async () => {
    await db.metadata.clear()
    await db.profiles.clear()
    await db.weights.clear()
    await db.products.clear()
    await db.foodEntries.clear()
    await db.nutritionDays.clear()
    await db.steps.clear()
    await db.workouts.clear()
    await db.energyPlans.clear()
    await db.photos.clear()
    await db.files.clear()
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

async function syntheticPng(width: number, height: number, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического фото нужен Canvas')
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => { if (value) resolve(value); else reject(new Error('Синтетическое фото не создано')) }, 'image/png')
  })
  return new File([blob], 'synthetic-geometry.png', { type: 'image/png' })
}
async function expectPhoto(title: string, width: number, height: number, color: number) {
  const locator = page.getByRole('img', { name: title, exact: true })
  await expect.element(locator).toBeVisible()
  const image = locator.element()
  if (!(image instanceof HTMLImageElement)) throw new Error('Галерея должна показать настоящее изображение')
  await image.decode()
  expect([image.naturalWidth, image.naturalHeight]).toEqual([width, height])
  expect((await (await fetch(image.src)).blob()).type).toBe('image/jpeg')
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для чтения синтетического пикселя нужен Canvas')
  context.drawImage(image, Math.floor(width / 2), Math.floor(height / 2), 1, 1, 0, 0, 1, 1)
  expect(context.getImageData(0, 0, 1, 1).data[color]).toBeGreaterThan(240)
}

test('галерея загружает PNG через форму, проверяет ошибки и сохраняет JPEG по датам после повторного открытия', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Фото', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 1, name: 'Фото', exact: true })).toBeVisible()
  await expect.element(page.getByText('Фотографий пока нет.', { exact: true })).toBeVisible()
  expect(window.location.hash).toBe('#photos')
  const date = page.getByLabelText('Дата фото', { exact: true })
  const title = page.getByLabelText('Подпись фото', { exact: true })
  const note = page.getByLabelText('Заметка к фото (необязательно)', { exact: true })
  const file = page.getByLabelText('Файл фото', { exact: true })
  const save = page.getByRole('button', { name: 'Добавить фото', exact: true })
  const blueTitle = 'Синтетическая синяя геометрия'
  const redTitle = 'Синтетическая геометрия выбранного дня с длинной подписью для галереи'
  const blue = await syntheticPng(32, 64, '#0000ff')
  await date.fill('2026-10-15')
  await title.fill(blueTitle)
  await file.upload(blue)
  await save.click()
  await expect.element(date).toHaveAccessibleDescription('Дата фото не может быть в будущем')
  await expect.element(date).toHaveFocus()
  expect(await db.photos.count()).toBe(0)
  expect(await db.files.count()).toBe(0)
  await date.fill('2026-10-13')
  await file.upload(new File(['<html>synthetic-invalid-photo</html>'], 'synthetic-invalid.png', { type: 'image/png' }))
  await save.click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Неподдерживаемый формат вложения')
  await expect.element(file).toHaveAccessibleDescription(/Неподдерживаемый формат вложения/)
  await expect.element(file).toHaveAttribute('aria-invalid', 'true')
  await expect.element(file).toHaveFocus()
  await expect.element(title).toHaveValue(blueTitle)
  await expect.element(date).toHaveValue('2026-10-13')
  expect(await db.photos.count()).toBe(0)
  expect(await db.files.count()).toBe(0)
  expect((await axe.run(view.container)).violations).toEqual([])

  await file.upload(blue)
  await note.fill('Синтетическая заметка синего образца')
  await userEvent.keyboard('{Tab}')
  await expect.element(file).toHaveFocus()
  await userEvent.keyboard('{Tab}')
  await expect.element(save).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('status').filter({ hasText: 'Фото добавлено' })).toHaveTextContent('Фото добавлено')
  await expect.element(title).toHaveFocus()
  await expect.element(title).toHaveValue('')
  await expectPhoto(blueTitle, 32, 64, 2)

  await date.fill('2026-10-14')
  await title.fill(redTitle)
  await note.fill('Синтетическая заметка красного образца')
  await file.upload(await syntheticPng(3072, 1536, '#ff0000'))
  await save.click()
  await expectPhoto(redTitle, 2048, 1024, 0)
  const gallery = page.getByRole('list', { name: 'Фотографии по датам', exact: true })
  const dates = () => Array.from(gallery.element().querySelectorAll('article time')).map(time => time.getAttribute('datetime'))
  expect(dates()).toEqual(['2026-10-14', '2026-10-13'])
  await expect.element(gallery.getByText('Синтетическая заметка красного образца', { exact: true })).toBeVisible()
  const saved = await db.photos.orderBy('date').reverse().toArray()
  expect(saved.map(photo => ({ title: photo.title, date: photo.date, width: photo.width, height: photo.height }))).toEqual([
    { title: redTitle, date: '2026-10-14', width: 2048, height: 1024 },
    { title: blueTitle, date: '2026-10-13', width: 32, height: 64 },
  ])
  expect(await db.files.count()).toBe(2)
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Фото', exact: true })).toBeVisible()
  await expectPhoto(redTitle, 2048, 1024, 0)
  await expectPhoto(blueTitle, 32, 64, 2)
  expect(dates()).toEqual(['2026-10-14', '2026-10-13'])
  expect(await db.photos.orderBy('date').reverse().toArray()).toEqual(saved)
  expect(await db.files.count()).toBe(2)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

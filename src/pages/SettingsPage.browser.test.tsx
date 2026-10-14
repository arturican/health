import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import type { FoodEntry, NutritionDay, Product } from '../domain/nutrition'
import type { Profile, Weight } from '../domain/profile'
import '../styles.css'

const objectUrls = new Set<string>()

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, async () => {
    await db.nutritionDays.clear()
    await db.foodEntries.clear()
    await db.products.clear()
    await db.weights.clear()
    await db.profiles.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
}

beforeEach(async () => {
  await resetTestState()
  await page.viewport(375, 812)
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
  await resetTestState()
  await page.viewport(1280, 800)
  vi.useRealTimers()
})

test('настройки скачивают локальный JSON со всеми текстовыми данными и освобождают object URL', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
  const profile: Profile = { id: 'self', name: 'Синтетический профиль', heightCm: 171.5, birthDate: '2000-02-29', formulaSex: 'none' }
  const weight: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-01', kg: 68.25 }
  const product: Product = { id: '00000000-0000-4000-8000-000000000002', name: 'Архивный синтетический продукт', source: 'Синтетическая этикетка', kcal: 250, protein: 12, fat: null, carbs: 0, archived: true }
  const food: FoodEntry = {
    id: '00000000-0000-4000-8000-000000000003', date: '2026-10-01', meal: 'lunch', productId: product.id,
    grams: 150, note: 'Синтетическая запись',
    snapshot: { name: 'Исторический синтетический продукт', source: 'Синтетическая историческая этикетка', kcal: 200, protein: 8, fat: null, carbs: 0 },
  }
  const nutritionDays: NutritionDay[] = [{ date: '2026-10-01', complete: true }, { date: '2026-10-02', complete: false }]
  await db.transaction('rw', db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, async () => {
    await db.profiles.add(profile)
    await db.weights.add(weight)
    await db.products.add(product)
    await db.foodEntries.add(food)
    await db.nutritionDays.bulkAdd(nutritionDays)
  })
  const originalCreate = URL.createObjectURL.bind(URL)
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    const url = originalCreate(blob)
    objectUrls.add(url)
    return url
  })
  const revoke = vi.spyOn(URL, 'revokeObjectURL')
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible()
  expect(window.location.hash).toBe('#settings')
  await page.getByRole('button', { name: 'Скачать текстовую копию', exact: true }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Текстовая копия подготовлена')
  await expect.element(page.getByRole('button', { name: 'Скачать текстовую копию', exact: true })).toBeEnabled()
  expect(create).toHaveBeenCalledTimes(1)
  const blob = create.mock.calls[0]?.[0]
  if (!(blob instanceof Blob)) throw new Error('Экспорт должен создать Blob')
  expect(blob.type).toBe('application/json')
  const exported: unknown = JSON.parse(await blob.text())
  expect(exported).toEqual({
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile, weights: [weight], products: [product], foodEntries: [food], nutritionDays,
  })
  expect(click).toHaveBeenCalledTimes(1)
  const anchor = click.mock.contexts[0]
  if (!(anchor instanceof HTMLAnchorElement)) throw new Error('Экспорт должен нажать ссылку скачивания')
  expect(anchor.download).toBe('health-diary-text-2026-10-14.json')
  expect(anchor.href).toMatch(/^blob:/)
  expect(anchor.isConnected).toBe(false)
  expect(document.querySelector('a[download]')).toBeNull()
  expect(revoke).toHaveBeenCalledExactlyOnceWith(anchor.href)
  await expect(fetch(anchor.href)).rejects.toThrow()
  expect(await db.profiles.get('self')).toEqual(profile)
  expect(await db.foodEntries.toArray()).toEqual([food])
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

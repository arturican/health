import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import type { TextBackup } from '../domain/backup'
import type { FoodEntry, NutritionDay, Product } from '../domain/nutrition'
import type { Profile, Weight } from '../domain/profile'
import type { Steps, Workout } from '../domain/activity'
import type { EnergyPlan } from '../domain/energyPlan'
import '../styles.css'

const objectUrls = new Set<string>()
const textTables = [db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans]

function activityRecords() {
  const steps: Steps = { date: '2026-10-01', count: 0 }
  const workout: Workout = { id: '00000000-0000-4000-8000-000000000005', date: steps.date, kind: 'Синтетическая тренировка', minutes: 30.5, kcal: null, source: 'Синтетический источник', note: 'Синтетическая заметка' }
  const plan: EnergyPlan = {
    id: '00000000-0000-4000-8000-000000000006', revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-20',
    goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: 'Синтетическая общая оценка', restingFormula: 'mifflin-st-jeor-1990',
    snapshot: { kg: 71.25, weightDate: steps.date, heightCm: 168.75, age: 30, formulaSex: 'male' },
  }
  return { steps: [steps], workouts: [workout], energyPlans: [plan] }
}

async function readRecords() {
  return db.transaction('r', textTables, async () => ({
    profiles: await db.profiles.toArray(), weights: await db.weights.toArray(), products: await db.products.toArray(),
    foodEntries: await db.foodEntries.toArray(), nutritionDays: await db.nutritionDays.toArray(),
    steps: await db.steps.toArray(), workouts: await db.workouts.toArray(), energyPlans: await db.energyPlans.toArray(),
  }))
}

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', textTables, async () => {
    await db.nutritionDays.clear()
    await db.foodEntries.clear()
    await db.products.clear()
    await db.weights.clear()
    await db.profiles.clear()
    await db.steps.clear()
    await db.workouts.clear()
    await db.energyPlans.clear()
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
  const activity = activityRecords()
  await db.transaction('rw', textTables, async () => {
    await db.profiles.add(profile)
    await db.weights.add(weight)
    await db.products.add(product)
    await db.foodEntries.add(food)
    await db.nutritionDays.bulkAdd(nutritionDays)
    await db.steps.bulkAdd(activity.steps)
    await db.workouts.bulkAdd(activity.workouts)
    await db.energyPlans.bulkAdd(activity.energyPlans)
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
  await expect.element(page.getByRole('status').filter({ hasText: 'Текстовая копия подготовлена' })).toHaveTextContent('Текстовая копия подготовлена')
  await expect.element(page.getByRole('button', { name: 'Скачать текстовую копию', exact: true })).toBeEnabled()
  expect(create).toHaveBeenCalledTimes(1)
  const blob = create.mock.calls[0]?.[0]
  if (!(blob instanceof Blob)) throw new Error('Экспорт должен создать Blob')
  expect(blob.type).toBe('application/json')
  const exported: unknown = JSON.parse(await blob.text())
  expect(exported).toEqual({
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile, weights: [weight], products: [product], foodEntries: [food], nutritionDays, ...activity,
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
  expect(await readRecords()).toEqual({ profiles: [profile], weights: [weight], products: [product], foodEntries: [food], nutritionDays, ...activity })
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

test('проверка файла отвергает неверные копии и показывает отменяемый предпросмотр без изменения базы', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
  const profile: Profile = { id: 'self', name: 'Синтетический профиль из файла', heightCm: 170, birthDate: '2000-02-29', formulaSex: 'none' }
  const weight: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-01', kg: 68 }
  const product: Product = { id: '00000000-0000-4000-8000-000000000002', name: 'Синтетический продукт из файла', source: 'Синтетическая этикетка', kcal: 200, protein: 8, fat: null, carbs: 0, archived: true }
  const food: FoodEntry = {
    id: '00000000-0000-4000-8000-000000000003', date: '2026-10-01', meal: 'lunch', productId: product.id, grams: 150, note: 'Синтетическая запись из файла',
    snapshot: { name: product.name, source: product.source, kcal: product.kcal, protein: product.protein, fat: product.fat, carbs: product.carbs },
  }
  const nutritionDay: NutritionDay = { date: '2026-10-01', complete: true }
  const activity = activityRecords()
  const backup: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile, weights: [weight], products: [product], foodEntries: [food], nutritionDays: [nutritionDay], ...activity,
  }
  const baseline = {
    profiles: [{ ...profile, name: 'Локальный синтетический профиль' }], weights: [{ ...weight, kg: 72 }],
    products: [{ ...product, name: 'Локальный синтетический продукт' }],
    foodEntries: [{ ...food, note: 'Локальная синтетическая запись' }], nutritionDays: [{ ...nutritionDay, complete: false }],
    steps: activity.steps.map(steps => ({ ...steps, count: 1234 })),
    workouts: activity.workouts.map(workout => ({ ...workout, kcal: 0, note: 'Локальная синтетическая тренировка' })),
    energyPlans: activity.energyPlans.map(plan => ({ ...plan, goalKcal: 1234 })),
  }
  await db.transaction('rw', textTables, async () => {
    await db.profiles.bulkAdd(baseline.profiles)
    await db.weights.bulkAdd(baseline.weights)
    await db.products.bulkAdd(baseline.products)
    await db.foodEntries.bulkAdd(baseline.foodEntries)
    await db.nutritionDays.bulkAdd(baseline.nutritionDays)
    await db.steps.bulkAdd(baseline.steps)
    await db.workouts.bulkAdd(baseline.workouts)
    await db.energyPlans.bulkAdd(baseline.energyPlans)
  })
  async function expectBaseline() {
    expect(await readRecords()).toEqual(baseline)
  }
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const file = page.getByLabelText('Файл текстовой копии', { exact: true })
  const check = page.getByRole('button', { name: 'Проверить файл', exact: true })
  const preview = page.getByRole('region', { name: 'Предпросмотр текстовой копии', exact: true })
  const privateText = 'Синтетическое содержимое закрытого поля'
  const invalidFiles = [
    { text: '{', error: 'Не удалось прочитать JSON в кодировке UTF-8' },
    { text: JSON.stringify({ ...backup, extra: privateText }), error: 'Неизвестные поля записи' },
    { text: JSON.stringify({ ...backup, version: 2 }), error: /1/ },
    { text: JSON.stringify({ ...backup, products: [product, product] }), error: 'Повторяющиеся идентификаторы' },
    { text: JSON.stringify({ ...backup, weights: [weight, { ...weight, id: '00000000-0000-4000-8000-000000000004' }] }), error: 'Повторяющиеся даты веса' },
    { text: JSON.stringify({ ...backup, nutritionDays: [nutritionDay, nutritionDay] }), error: 'Повторяющиеся даты полноты питания' },
    { text: JSON.stringify({ ...backup, products: [] }), error: 'Запись еды ссылается на отсутствующий продукт' },
    { text: JSON.stringify({ ...backup, weights: [{ ...weight, date: '2026-10-15' }] }), error: 'Записи дневника не могут быть в будущем' },
    { text: JSON.stringify({ ...backup, foodEntries: [{ ...food, date: '2026-10-15' }] }), error: 'Записи дневника не могут быть в будущем' },
    { text: JSON.stringify({ ...backup, nutritionDays: [{ ...nutritionDay, date: '2026-10-15' }] }), error: 'Записи дневника не могут быть в будущем' },
  ]
  for (const [index, input] of invalidFiles.entries()) {
    await file.upload(new File([input.text], `synthetic-invalid-${String(index)}.json`, { type: 'application/json' }))
    await check.click()
    await expect.element(page.getByRole('alert')).toHaveTextContent(input.error)
    await expect.element(page.getByRole('alert')).not.toHaveTextContent(privateText)
    await expect.element(preview).not.toBeInTheDocument()
    await expect.element(check).toBeEnabled()
    await expectBaseline()
  }

  await file.upload(new File([JSON.stringify(backup)], 'synthetic-valid.json', { type: 'application/json' }))
  await check.click()
  await expect.element(page.getByRole('status').filter({ hasText: 'Файл проверен; база не изменена' })).toHaveTextContent('Файл проверен; база не изменена')
  await expect.element(preview).toBeVisible()
  await expect.element(preview.getByText('Профилей: 1. Измерений веса: 1. Продуктов: 1. Записей еды: 1. Отметок полноты: 1.', { exact: true })).toBeVisible()
  await expect.element(preview.getByText('Итогов шагов: 1. Тренировок: 1. Версий плана: 1.', { exact: true })).toBeVisible()
  await expect.element(preview.getByText('Восстановление заменяет перечисленные данные. Фото и документы с их показателями сохраняются.', { exact: true })).toBeVisible()
  await expectBaseline()
  expect((await axe.run(view.container)).violations).toEqual([])
  await preview.getByRole('button', { name: 'Отменить импорт', exact: true }).click()
  await expect.element(preview).not.toBeInTheDocument()
  await expectBaseline()
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
}, 15000)

test('восстановление требует нового согласия после отмены и заменяет данные с сохранением профиля после remount', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
  const initialProfile: Profile = { id: 'self', name: 'Прежний синтетический профиль', heightCm: 170, birthDate: null, formulaSex: 'none' }
  const initialWeight: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-01', kg: 75 }
  const product: Product = { id: '00000000-0000-4000-8000-000000000002', name: 'Прежний синтетический продукт', source: 'Синтетическая этикетка', kcal: 200, protein: 8, fat: null, carbs: 0, archived: true }
  const food: FoodEntry = {
    id: '00000000-0000-4000-8000-000000000003', date: '2026-10-01', meal: 'lunch', productId: product.id, grams: 150, note: 'Прежняя синтетическая запись',
    snapshot: { name: product.name, source: product.source, kcal: product.kcal, protein: product.protein, fat: product.fat, carbs: product.carbs },
  }
  const baseline = {
    profiles: [initialProfile], weights: [initialWeight], products: [product], foodEntries: [food],
    nutritionDays: [{ date: '2026-10-01', complete: false }], ...activityRecords(),
  }
  await db.transaction('rw', textTables, async () => {
    await db.profiles.bulkAdd(baseline.profiles)
    await db.weights.bulkAdd(baseline.weights)
    await db.products.bulkAdd(baseline.products)
    await db.foodEntries.bulkAdd(baseline.foodEntries)
    await db.nutritionDays.bulkAdd(baseline.nutritionDays)
    await db.steps.bulkAdd(baseline.steps)
    await db.workouts.bulkAdd(baseline.workouts)
    await db.energyPlans.bulkAdd(baseline.energyPlans)
  })
  const restoredProfile: Profile = { id: 'self', name: 'Восстановленный синтетический профиль', heightCm: 175, birthDate: '1990-03-01', formulaSex: 'female' }
  const restoredWeight: Weight = { id: '00000000-0000-4000-8000-000000000004', date: '2026-10-02', kg: 70.5 }
  const restoredActivity = {
    steps: [{ date: restoredWeight.date, count: 4321 }],
    workouts: baseline.workouts.map(workout => ({ ...workout, id: '00000000-0000-4000-8000-000000000007', date: restoredWeight.date, kind: 'Восстановленная синтетическая тренировка', kcal: 0 })),
    energyPlans: baseline.energyPlans.map(plan => ({ ...plan, id: '00000000-0000-4000-8000-000000000008', revision: 3, goalKcal: 1800 })),
  }
  const backup: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile: restoredProfile, weights: [restoredWeight], products: [], foodEntries: [], nutritionDays: [], ...restoredActivity,
  }
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const check = page.getByRole('button', { name: 'Проверить файл', exact: true })
  const preview = page.getByRole('region', { name: 'Предпросмотр текстовой копии', exact: true })
  const consent = preview.getByRole('checkbox', { name: 'Согласен заменить текстовые данные дневника', exact: true })
  const restore = preview.getByRole('button', { name: 'Восстановить текстовую копию', exact: true })
  await page.getByLabelText('Файл текстовой копии', { exact: true }).upload(new File([JSON.stringify(backup)], 'synthetic-restore.json', { type: 'application/json' }))
  await check.click()
  await expect.element(preview).toBeVisible()
  await expect.element(preview.getByText('Итогов шагов: 1. Тренировок: 1. Версий плана: 1.', { exact: true })).toBeVisible()
  await expect.element(restore).toBeDisabled()
  await expect.element(consent).not.toBeChecked()
  expect(await readRecords()).toEqual(baseline)
  await consent.click()
  await expect.element(restore).toBeEnabled()
  expect(await readRecords()).toEqual(baseline)
  expect((await axe.run(view.container)).violations).toEqual([])
  await preview.getByRole('button', { name: 'Отменить импорт', exact: true }).click()
  await expect.element(preview).not.toBeInTheDocument()
  expect(await readRecords()).toEqual(baseline)

  await check.click()
  await expect.element(preview).toBeVisible()
  await expect.element(restore).toBeDisabled()
  await expect.element(consent).not.toBeChecked()
  expect(await readRecords()).toEqual(baseline)
  await consent.click()
  await expect.element(restore).toBeEnabled()
  await restore.click()
  await expect.element(page.getByRole('status').filter({ hasText: 'Текстовая копия восстановлена' })).toHaveTextContent('Текстовая копия восстановлена')
  await expect.element(preview).not.toBeInTheDocument()
  const restored = { profiles: [restoredProfile], weights: [restoredWeight], products: [], foodEntries: [], nutritionDays: [], ...restoredActivity }
  expect(await readRecords()).toEqual(restored)

  await view.unmount()
  const reopened = await render(<App />)
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 1, name: 'Профиль', exact: true })).toBeVisible()
  await expect.element(page.getByText(restoredProfile.name, { exact: true })).toBeVisible()
  await expect.element(page.getByText('175 см', { exact: true })).toBeVisible()
  await expect.element(page.getByText('01.03.1990', { exact: true })).toBeVisible()
  await expect.element(page.getByText('Женский', { exact: true })).toBeVisible()
  await expect.element(page.getByText(initialProfile.name, { exact: true })).not.toBeInTheDocument()
  expect(await readRecords()).toEqual(restored)
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])

  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const legacy = {
    format: 'health-diary-text', version: 1, exportedAt: backup.exportedAt,
    profile: restoredProfile, weights: [restoredWeight], products: [], foodEntries: [], nutritionDays: [],
  }
  await page.getByLabelText('Файл текстовой копии', { exact: true }).upload(new File([JSON.stringify(legacy)], 'synthetic-legacy-v1.json', { type: 'application/json' }))
  await check.click()
  await expect.element(preview).toBeVisible()
  await expect.element(preview.getByText('Итогов шагов: 0. Тренировок: 0. Версий плана: 0.', { exact: true })).toBeVisible()
  await expect.element(restore).toBeDisabled()
  await expect.element(consent).not.toBeChecked()
  expect(await readRecords()).toEqual(restored)
  await consent.click()
  expect(await readRecords()).toEqual(restored)
  await restore.click()
  await expect.element(page.getByRole('status').filter({ hasText: 'Текстовая копия восстановлена' })).toHaveTextContent('Текстовая копия восстановлена')
  await expect.element(preview).not.toBeInTheDocument()
  expect(await readRecords()).toEqual({ ...restored, steps: [], workouts: [], energyPlans: [] })
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
}, 15000)

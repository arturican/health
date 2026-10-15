import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { exportTextBackup, restoreTextBackup } from './backupRepository'
import { seedProducts } from './productRepository'
import { BACKUP_MAX_RECORDS, serializeTextBackup, textBackupSchema, type TextBackup } from '../domain/backup'
import { validate } from '../domain/schema'
import type { Profile, Weight } from '../domain/profile'
import type { FoodEntry, Product } from '../domain/nutrition'
import type { Steps, Workout } from '../domain/activity'
import type { EnergyPlan } from '../domain/energyPlan'
import { expectDiaryMetadata } from '../../tests/generationAssertions'

const exportedAt = '2026-10-14T12:34:56.000Z'
const profile: Profile = { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: null, formulaSex: 'none' }
const weight: Weight = { id: '00000000-0000-4000-8000-000000000101', date: '2026-10-14', kg: 70.5 }
const product: Product = { id: '00000000-0000-4000-8000-000000000201', name: 'Синтетический продукт', source: '', kcal: 250, protein: 12, fat: null, carbs: 0, archived: false }
const archived: Product = { ...product, id: '00000000-0000-4000-8000-000000000202', name: 'Синтетический архив', kcal: 0, protein: null, fat: 0, carbs: null, archived: true }
const food: FoodEntry = {
  id: '00000000-0000-4000-8000-000000000301', date: '2026-10-13', meal: 'lunch', productId: product.id, grams: 150,
  snapshot: { name: 'Прежнее синтетическое название', source: 'Синтетическая этикетка', kcal: 400, protein: 5, fat: null, carbs: 0 },
  note: 'Синтетическая запись еды',
}
const nutritionDays = [{ date: '2026-10-13', complete: true }, { date: '2026-10-14', complete: false }]
const steps: Steps[] = [{ date: '2026-10-13', count: 0 }, { date: '2026-10-14', count: 1234 }]
const workout: Workout = {
  id: '00000000-0000-4000-8000-000000000701', date: '2026-10-13', kind: 'Синтетическая прогулка', minutes: 20,
  kcal: null, source: 'Синтетический дневник', note: 'Оценка расхода неизвестна',
}
const workouts: Workout[] = [workout, { ...workout, id: '00000000-0000-4000-8000-000000000702', date: '2026-10-14', kcal: 0, note: '' }]
const plan: EnergyPlan = {
  id: '00000000-0000-4000-8000-000000000801', revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-14',
  goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: 'Синтетический план', restingFormula: 'mifflin-st-jeor-1990',
  snapshot: { kg: weight.kg, weightDate: weight.date, heightCm: profile.heightCm, age: null, formulaSex: 'none' },
}
const energyPlans: EnergyPlan[] = [plan, { ...plan, id: '00000000-0000-4000-8000-000000000802', revision: 2, effectiveFrom: '2026-10-16', goalKcal: null, method: 'factor', manualKcal: null, factor: 1.4 }]
const empty: TextBackup = { format: 'health-diary-text', version: 1, exportedAt, profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] }
const populated: TextBackup = { ...empty, profile, weights: [weight], products: [product, archived], foodEntries: [food], nutritionDays, steps, workouts, energyPlans }
const replacement: TextBackup = {
  ...empty,
  profile: { ...profile, name: 'Импортированный синтетический профиль', heightCm: 180, birthDate: '2000-01-01' },
  weights: [{ ...weight, id: '00000000-0000-4000-8000-000000000401', date: '2026-10-12', kg: 75 }],
  products: [{ ...archived, id: '00000000-0000-4000-8000-000000000501', name: 'Импортированный синтетический архив' }],
  foodEntries: [{ ...food, id: '00000000-0000-4000-8000-000000000601', productId: '00000000-0000-4000-8000-000000000501', date: '2026-10-12', meal: 'snack', grams: 225, note: 'Импортированная синтетическая запись' }],
  nutritionDays: [{ date: '2026-10-12', complete: false }],
  steps: [{ date: '2026-10-12', count: 15 }],
  workouts: [{ ...workout, id: '00000000-0000-4000-8000-000000000703', date: '2026-10-12', minutes: 30, kcal: 42 }],
  energyPlans: [{ ...plan, id: '00000000-0000-4000-8000-000000000803', revision: 5, effectiveFrom: '2026-10-15', goalKcal: 1800, manualKcal: 2300, snapshot: { kg: 75, weightDate: '2026-10-12', heightCm: 180, age: 26, formulaSex: 'none' } }],
}
const metadata = [{ id: 'catalog-seeded', value: 'done' }, { id: 'fixture', value: 'Синтетическая служебная запись' }]
const connections: Dexie[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-backup-${String(++sequence)}`)
  connections.push(database)
  return database
}
async function populate(database: DiaryDatabase) {
  await database.profiles.add(profile)
  await database.weights.add(weight)
  await database.products.bulkAdd([product, archived])
  await database.foodEntries.add(food)
  await database.nutritionDays.bulkAdd(nutritionDays)
  await database.steps.bulkAdd(steps)
  await database.workouts.bulkAdd(workouts)
  await database.energyPlans.bulkAdd(energyPlans)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(exportedAt))
})
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
})

it('экспортирует пустую базу с явными форматом, версией, UTC-временем и отсутствующим профилем', async () => {
  const database = createDatabase()
  expect(await exportTextBackup(database)).toEqual(empty)
  expect(await database.nutritionDays.count()).toBe(0)
})

it('читает все данные одной readonly-транзакцией, сохраняет архив, снимки, null и нули без изменения базы', async () => {
  const database = createDatabase()
  await populate(database)
  await database.metadata.put({ id: 'fixture', value: 'Синтетическая служебная запись' })
  const transactions = new Set<object>()
  function observe<T>(value: T): T {
    const transaction = Dexie.currentTransaction
    expect(transaction.mode).toBe('readonly')
    transactions.add(transaction)
    return value
  }
  database.profiles.hook('reading', observe)
  database.weights.hook('reading', observe)
  database.products.hook('reading', observe)
  database.foodEntries.hook('reading', observe)
  database.nutritionDays.hook('reading', observe)
  database.steps.hook('reading', observe)
  database.workouts.hook('reading', observe)
  database.energyPlans.hook('reading', observe)
  const backup = await exportTextBackup(database)
  database.profiles.hook('reading').unsubscribe(observe)
  database.weights.hook('reading').unsubscribe(observe)
  database.products.hook('reading').unsubscribe(observe)
  database.foodEntries.hook('reading').unsubscribe(observe)
  database.nutritionDays.hook('reading').unsubscribe(observe)
  database.steps.hook('reading').unsubscribe(observe)
  database.workouts.hook('reading').unsubscribe(observe)
  database.energyPlans.hook('reading').unsubscribe(observe)
  expect(transactions.size).toBe(1)
  expect(backup).toEqual(populated)
  const parsed: unknown = JSON.parse(serializeTextBackup(backup))
  expect(validate(textBackupSchema, parsed)).toEqual(populated)
  expect(await database.profiles.toArray()).toEqual([profile])
  expect(await database.weights.toArray()).toEqual([weight])
  expect(await database.products.toArray()).toEqual([product, archived])
  expect(await database.foodEntries.toArray()).toEqual([food])
  expect(await database.nutritionDays.toArray()).toEqual(nutritionDays)
  expect(await database.steps.toArray()).toEqual(steps)
  expect(await database.workouts.toArray()).toEqual(workouts)
  expect(await database.energyPlans.toArray()).toEqual(energyPlans)
  expect(await database.metadata.toArray()).toEqual([{ id: 'fixture', value: 'Синтетическая служебная запись' }])
})

it('отклоняет повреждённые записи всех таблиц и нестрогую или неизвестную схему копии', async () => {
  const database = createDatabase()
  await populate(database)
  const cases: [string, unknown, unknown][] = [
    ['profiles', profile, { ...profile, heightCm: '170' }],
    ['weights', weight, { ...weight, kg: Infinity }],
    ['products', product, { ...product, unknown: true }],
    ['foodEntries', food, { ...food, snapshot: { ...food.snapshot, kcal: NaN } }],
    ['nutritionDays', nutritionDays[0], { date: '2026-10-13', complete: 'true' }],
    ['steps', steps[0], { date: '2026-10-13', count: -1 }],
    ['workouts', workout, { ...workout, minutes: 0 }],
    ['energyPlans', plan, { ...plan, manualKcal: null }],
  ]
  for (const [name, original, corrupted] of cases) {
    const table = database.table<unknown, string>(name)
    await table.put(corrupted)
    await expect(exportTextBackup(database)).rejects.toThrow()
    await table.put(original)
  }
  for (const input of [null, { ...empty, version: 2 }, { ...empty, format: 'unknown' }, { ...empty, exportedAt: 'не дата' }, { ...empty, extra: true }]) {
    expect(() => serializeTextBackup(input)).toThrow()
  }
  expect(await exportTextBackup(database)).toEqual(populated)
})

it('ограничивает число записей и размер UTF-8 текста до создания скачиваемого файла', () => {
  const weights = Array.from({ length: BACKUP_MAX_RECORDS + 1 }, () => weight)
  expect(() => serializeTextBackup({ ...empty, weights })).toThrow(/100000/)
  const foodEntries = Array.from({ length: 20000 }, (_, index) => ({
    ...food, id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, note: 'Ж'.repeat(500),
  }))
  expect(() => serializeTextBackup({ ...populated, foodEntries })).toThrow('Текстовая копия превышает 20 MiB')
})

it('использует только тестовый singleton по умолчанию и сохраняет данные после экспорта', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  expect(await exportTextBackup()).toEqual(empty)
  await populate(db)
  expect(await exportTextBackup()).toEqual(populated)
  expect(await db.products.toArray()).toEqual([product, archived])
  expect(await db.foodEntries.toArray()).toEqual([food])
})

it('заменяет все восемь текстовых таблиц и удаляет только служебный флаг примеров', async () => {
  const database = createDatabase()
  await populate(database)
  await database.metadata.bulkPut(metadata)
  await restoreTextBackup(replacement, database)
  expect(await exportTextBackup(database)).toEqual(replacement)
  await expectDiaryMetadata(database, [{ id: 'fixture', value: 'Синтетическая служебная запись' }])
})

it('восстанавливает старую v1 без активности и планов как пустые новые таблицы', async () => {
  const database = createDatabase()
  await populate(database)
  const legacy = {
    format: replacement.format, version: replacement.version, exportedAt: replacement.exportedAt,
    profile: replacement.profile, weights: replacement.weights, products: replacement.products,
    foodEntries: replacement.foodEntries, nutritionDays: replacement.nutritionDays,
  }
  await restoreTextBackup(legacy, database)
  expect(await exportTextBackup(database)).toEqual({ ...replacement, steps: [], workouts: [], energyPlans: [] })
})

it('отвергает дополнительный или единственный чужой профиль, не пропуская повреждённые данные при экспорте', async () => {
  const database = createDatabase()
  await populate(database)
  const table = database.table<unknown, string>('profiles')
  const foreign = { ...profile, id: 'foreign' }
  await table.add(foreign)
  await expect(exportTextBackup(database)).rejects.toThrow('В дневнике поддерживается один профиль')
  expect(await table.count()).toBe(2)
  await database.profiles.delete('self')
  await expect(exportTextBackup(database)).rejects.toThrow()
  expect(await table.toArray()).toEqual([foreign])
})

it('восстанавливает пустую копию с null-профилем и позволяет снова добавить примеры по явному вызову', async () => {
  const database = createDatabase()
  await populate(database)
  await database.metadata.bulkPut(metadata)
  await restoreTextBackup(empty, database)
  expect(await exportTextBackup(database)).toEqual(empty)
  expect(await database.metadata.get('catalog-seeded')).toBeUndefined()
  await seedProducts(database)
  expect(await database.products.count()).toBe(2)
  expect((await database.products.toArray()).every(value => value.name.startsWith('Пример:'))).toBe(true)
  expect(await database.metadata.get('fixture')).toEqual({ id: 'fixture', value: 'Синтетическая служебная запись' })
  expect(await database.metadata.get('catalog-seeded')).toEqual({ id: 'catalog-seeded', value: 'done' })
})

it('повторно валидирует неизвестный вход и связи до открытия транзакции, сохраняя всю базу', async () => {
  const database = createDatabase()
  await populate(database)
  await database.metadata.bulkPut(metadata)
  const transaction = vi.spyOn(database, 'transaction')
  for (const input of [
    null, { ...populated, version: 2 }, { ...populated, products: [] },
    { ...populated, steps: [{ date: '2026-10-15', count: 0 }] },
    { ...populated, workouts: [{ ...workout, date: '2026-10-15' }] },
    { ...populated, energyPlans: [{ ...plan, factor: 1.4 }] },
    { ...populated, energyPlans: [{ ...plan, createdOn: '2026-10-15', effectiveFrom: '2026-10-16' }] },
  ]) {
    await expect(restoreTextBackup(input, database)).rejects.toThrow()
  }
  expect(transaction).not.toHaveBeenCalled()
  transaction.mockRestore()
  expect(await exportTextBackup(database)).toEqual(populated)
  expect(await database.metadata.toArray()).toEqual(metadata)
})

it('откатывает уже заменённые таблицы и служебные данные при позднем отказе bulkAdd', async () => {
  const database = createDatabase()
  await populate(database)
  await database.metadata.bulkPut(metadata)
  const failure = vi.spyOn(database.energyPlans, 'bulkAdd').mockImplementationOnce(() => Dexie.Promise.resolve().then(async () => {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    expect(await database.profiles.get('self')).toEqual(replacement.profile)
    expect(await database.weights.toArray()).toEqual(replacement.weights)
    expect(await database.products.toArray()).toEqual(replacement.products)
    expect(await database.foodEntries.toArray()).toEqual(replacement.foodEntries)
    expect(await database.nutritionDays.toArray()).toEqual(replacement.nutritionDays)
    expect(await database.steps.toArray()).toEqual(replacement.steps)
    expect(await database.workouts.toArray()).toEqual(replacement.workouts)
    expect(await database.energyPlans.count()).toBe(0)
    await database.metadata.delete('catalog-seeded')
    expect(await database.metadata.get('catalog-seeded')).toBeUndefined()
    throw new Error('Синтетический поздний отказ записи')
  }))
  await expect(restoreTextBackup(replacement, database)).rejects.toThrow('Синтетический поздний отказ записи')
  failure.mockRestore()
  expect(await exportTextBackup(database)).toEqual(populated)
  expect(await database.metadata.toArray()).toEqual(metadata)
})

it('восстанавливает через тестовый singleton после его повторного открытия', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  await populate(db)
  await db.metadata.bulkPut(metadata)
  await restoreTextBackup(replacement)
  expect(await exportTextBackup()).toEqual(replacement)
  await expectDiaryMetadata(db, [{ id: 'fixture', value: 'Синтетическая служебная запись' }])
})

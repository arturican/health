import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { saveSteps } from './stepsRepository'
import { setNutritionDay } from './nutritionRepository'
import { saveWeight, updateWeight } from './weightRepository'
import { addWorkout, updateWorkout } from './workoutRepository'
import { createProfile } from './profileRepository'

vi.mock('../domain/backup', async importOriginal => ({ ...await importOriginal<typeof import('../domain/backup')>(), BACKUP_MAX_RECORDS: 3 }))

const connections: DiaryDatabase[] = []
const dates = ['2026-10-10', '2026-10-11', '2026-10-12'] as const
const profile = { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: null, formulaSex: 'none' }
const workout = { date: dates[0], kind: 'Синтетическая прогулка', minutes: 20, kcal: null, source: '', note: '' }
const kinds = ['weight', 'steps', 'nutrition', 'workout'] as const
type Journal = typeof kinds[number]
const tables = { weight: 'weights', steps: 'steps', nutrition: 'nutritionDays', workout: 'workouts' } as const
function createDatabase(name = `health-diary-test-record-journals-${crypto.randomUUID()}`) {
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
async function append(kind: Journal, date: string, database: DiaryDatabase): Promise<unknown> {
  if (kind === 'weight') return saveWeight({ date, kg: 70.5 }, database)
  if (kind === 'steps') return saveSteps({ date, count: 100 }, database)
  if (kind === 'nutrition') return setNutritionDay(date, true, database)
  return addWorkout({ ...workout, date }, database)
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of connections) database.close()
  await Promise.all([...new Set(connections.map(database => database.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
})

it('лимит новых дат шагов сохраняет прежние три дня', async () => {
  const database = createDatabase()
  for (const date of ['2026-10-10', '2026-10-11', '2026-10-12']) await saveSteps({ date, count: 100 }, database)
  const before = await database.steps.toArray()
  await expect(saveSteps({ date: '2026-10-13', count: 200 }, database)).rejects.toThrow(/лимит/i)
  expect(await database.steps.toArray()).toEqual(before)
  await saveSteps({ date: dates[0], count: 0 }, database)
  expect(await database.steps.get(dates[0])).toEqual({ date: dates[0], count: 0 })
  expect(await database.steps.count()).toBe(3)
  expect(await database.steps.toArray()).toEqual(expect.arrayContaining(before.slice(1)))
})

it('при лимите измерений обновляет прежнюю дату с тем же ID и переносит её, сохраняя число записей', async () => {
  const database = createDatabase()
  const first = { id: '00000000-0000-4000-8000-000000000001', date: dates[0], kg: 70 }
  await createProfile(profile, first, database)
  await saveWeight({ date: dates[1], kg: 71 }, database)
  await saveWeight({ date: dates[2], kg: 72 }, database)
  const before = await database.weights.toArray()
  await expect(saveWeight({ date: '2026-10-13', kg: 73 }, database)).rejects.toThrow(/лимит/i)
  expect(await database.weights.toArray()).toEqual(before)
  await saveWeight({ date: first.date, kg: 69.5 }, database)
  expect(await database.weights.get(first.id)).toEqual({ ...first, kg: 69.5 })
  await updateWeight(first.id, { date: '2026-10-13', kg: 69.25 }, database)
  expect(await database.weights.get(first.id)).toEqual({ ...first, date: '2026-10-13', kg: 69.25 })
  expect(await database.weights.where('date').equals(first.date).count()).toBe(0)
  expect(await database.weights.count()).toBe(3)
  expect(await database.weights.toArray()).toEqual(expect.arrayContaining(before.filter(weight => weight.id !== first.id)))
})

it('при лимите полноты питания допускает явное false для прежнего дня и отклоняет новый', async () => {
  const database = createDatabase()
  for (const date of dates) await setNutritionDay(date, true, database)
  const before = await database.nutritionDays.toArray()
  await expect(setNutritionDay('2026-10-13', false, database)).rejects.toThrow(/лимит/i)
  expect(await database.nutritionDays.toArray()).toEqual(before)
  await setNutritionDay(dates[0], false, database)
  expect(await database.nutritionDays.get(dates[0])).toEqual({ date: dates[0], complete: false })
  expect(await database.nutritionDays.count()).toBe(3)
  expect(await database.nutritionDays.toArray()).toEqual(expect.arrayContaining(before.slice(1)))
})

it('при лимите тренировок сохраняет историю, но позволяет править и переносить существующую запись', async () => {
  const database = createDatabase()
  const first = await addWorkout(workout, database)
  await addWorkout({ ...workout, date: dates[1] }, database)
  await addWorkout({ ...workout, date: dates[2] }, database)
  const before = await database.workouts.toArray()
  await expect(addWorkout(workout, database)).rejects.toThrow(/лимит/i)
  expect(await database.workouts.toArray()).toEqual(before)
  const changes = { ...workout, date: '2026-10-13', minutes: 15.25, kcal: 0, note: 'Синтетическая правка' }
  await updateWorkout(first.id, changes, database)
  expect(await database.workouts.get(first.id)).toEqual({ ...changes, id: first.id })
  expect(await database.workouts.count()).toBe(3)
  expect(await database.workouts.toArray()).toEqual(expect.arrayContaining(before.filter(value => value.id !== first.id)))
})

it.each(kinds)('конкурентные новые даты %s через два соединения занимают только последний слот', async kind => {
  const database = createDatabase()
  if (kind === 'weight') await database.profiles.add({ ...profile, id: 'self', formulaSex: 'none' })
  await append(kind, dates[0], database)
  await append(kind, dates[1], database)
  const table = database.table<unknown, string>(tables[kind])
  const before = await table.toArray()
  const other = createDatabase(database.name)
  const results = await Promise.allSettled([append(kind, dates[2], database), append(kind, '2026-10-13', other)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failures = results.filter(result => result.status === 'rejected')
  expect(failures).toHaveLength(1)
  const reason: unknown = failures[0]?.reason
  expect(reason).toBeInstanceOf(Error)
  if (!(reason instanceof Error)) throw new Error('Ожидался отказ лимита')
  expect(reason.message).toMatch(/лимит/i)
  expect(await table.count()).toBe(3)
  expect(await table.toArray()).toEqual(expect.arrayContaining(before))
  expect(await table.where('date').anyOf([dates[2], '2026-10-13']).count()).toBe(1)
})

it.each(['weight', 'steps', 'nutrition'] as const)('конкурентные upsert %s одной новой даты оба проходят, сохраняя единственную запись последнего слота', async kind => {
  const database = createDatabase()
  if (kind === 'weight') await database.profiles.add({ ...profile, id: 'self', formulaSex: 'none' })
  await append(kind, dates[0], database)
  await append(kind, dates[1], database)
  const table = database.table<unknown, string>(tables[kind])
  const before = await table.toArray()
  await Promise.all([append(kind, dates[2], database), append(kind, dates[2], createDatabase(database.name))])
  expect(await table.count()).toBe(3)
  expect(await table.where('date').equals(dates[2]).count()).toBe(1)
  expect(await table.toArray()).toEqual(expect.arrayContaining(before))
})

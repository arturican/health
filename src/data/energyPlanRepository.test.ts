import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addEnergyPlan, getEnergyPlan, listEnergyPlans } from './energyPlanRepository'

const today = '2026-10-14'
const input = { effectiveFrom: today, goalKcal: 1800, method: 'factor', manualKcal: null, factor: 1.4, source: 'Синтетическая оценка' }
const profile = { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: '1996-10-14', formulaSex: 'male' }
const weight = { id: '00000000-0000-4000-8000-000000000001', date: today, kg: 70 }
const connections: DiaryDatabase[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-plans-${String(++sequence)}`)
  connections.push(database)
  return database
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
})
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all(connections.map(connection => Dexie.delete(connection.name)))
  connections.length = 0
  vi.useRealTimers()
})

it('сохраняет независимые снимки и выбирает версию по дате, затем по revision', async () => {
  const database = createDatabase()
  await database.profiles.add({ ...profile, id: 'self', formulaSex: 'male' })
  await database.weights.add(weight)
  expect(await getEnergyPlan(today, database)).toBeNull()
  const first = await addEnergyPlan(input, database)
  expect(first.snapshot).toEqual({ kg: 70, weightDate: today, heightCm: 170, age: 30, formulaSex: 'male' })
  expect(first.revision).toBe(1)
  await database.profiles.put({ ...profile, id: 'self', formulaSex: 'female', heightCm: 180 })
  await database.weights.put({ ...weight, kg: 75 })
  const second = await addEnergyPlan({ ...input, goalKcal: 0, method: 'manual', manualKcal: 0, factor: null }, database)
  const future = await addEnergyPlan({ ...input, effectiveFrom: '2026-10-15' }, database)
  expect(second.snapshot).toMatchObject({ kg: 75, heightCm: 180, formulaSex: 'female' })
  expect(await database.energyPlans.get(first.id)).toEqual(first)
  expect(new Set([first.id, second.id, future.id]).size).toBe(3)
  expect(await getEnergyPlan(today, database)).toEqual(second)
  expect(await getEnergyPlan('2026-10-13', database)).toBeNull()
  expect(await getEnergyPlan('2026-10-15', database)).toEqual(future)
  expect(await listEnergyPlans(database)).toEqual([future, second, first])
})

it('сохраняет неизвестные параметры без подстановки нулей, включая вызов singleton по умолчанию', async () => {
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  expect(await getEnergyPlan()).toBeNull()
  const plan = await addEnergyPlan({ ...input, goalKcal: null, method: 'none', factor: null })
  expect(plan.snapshot).toEqual({ kg: null, weightDate: null, heightCm: null, age: null, formulaSex: 'none' })
  expect(await getEnergyPlan()).toEqual(plan)
  expect(await listEnergyPlans()).toEqual([plan])
})

it('отклоняет неправильный ввод до транзакции и проверяет повреждённую историю', async () => {
  const database = createDatabase()
  const transaction = vi.spyOn(database, 'transaction')
  for (const value of [null, { ...input, effectiveFrom: '2026-10-13' }, { ...input, factor: 0 }, { ...input, manualKcal: 10 }, { ...input, extra: true }]) {
    await expect(addEnergyPlan(value, database)).rejects.toThrow()
  }
  expect(transaction).not.toHaveBeenCalled()
  transaction.mockRestore()
  await expect(getEnergyPlan('2026-02-29', database)).rejects.toThrow()
  const plan = await addEnergyPlan(input, database)
  await database.table<unknown, string>('energyPlans').put({ ...plan, snapshot: { ...plan.snapshot, kg: '70' } })
  await expect(listEnergyPlans(database)).rejects.toThrow()
  await expect(addEnergyPlan(input, database)).rejects.toThrow()
  expect(await database.energyPlans.count()).toBe(1)
})

it('не теряет одновременные версии и не оставляет запись при отказе хранения', async () => {
  const database = createDatabase()
  const plans = await Promise.all([addEnergyPlan(input, database), addEnergyPlan(input, database)])
  expect(plans.map(plan => plan.revision).sort()).toEqual([1, 2])
  const failure = () => { throw new Error('Синтетический отказ записи') }
  database.energyPlans.hook('creating', failure)
  await expect(addEnergyPlan(input, database)).rejects.toThrow('Синтетический отказ записи')
  database.energyPlans.hook('creating').unsubscribe(failure)
  expect(await database.energyPlans.count()).toBe(2)
  expect((await addEnergyPlan(input, database)).revision).toBe(3)
  database.close()
  await database.open()
  expect(await database.energyPlans.count()).toBe(3)
})

it('мигрирует v7 и сохраняет прежние шаги, тренировки и профиль', async () => {
  const database = createDatabase()
  const previous = new Dexie(database.name)
  previous.version(7).stores({ metadata: 'id', profiles: 'id', weights: 'id,&date', products: 'id,name', foodEntries: 'id,date,[date+meal]', nutritionDays: 'date', steps: 'date', workouts: 'id,date' })
  await previous.table<unknown, string>('profiles').add(profile)
  await previous.table<unknown, string>('weights').add(weight)
  await previous.table<unknown, string>('steps').add({ date: today, count: 0 })
  const workout = { id: weight.id, date: weight.date, kind: 'Синтетическая тренировка', minutes: 30, kcal: null, source: '', note: '' }
  await previous.table<unknown, string>('workouts').add(workout)
  previous.close()
  const plan = await addEnergyPlan(input, database)
  expect(plan.snapshot).toMatchObject({ kg: 70, age: 30 })
  expect(await database.steps.toArray()).toEqual([{ date: today, count: 0 }])
  expect(await database.workouts.toArray()).toEqual([workout])
  expect(await database.profiles.toArray()).toEqual([profile])
  expect(await database.weights.toArray()).toEqual([weight])
})

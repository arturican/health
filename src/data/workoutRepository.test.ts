import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addWorkout, listWorkouts } from './workoutRepository'
import type { Workout } from '../domain/activity'
import type { Profile, Weight } from '../domain/profile'
import type { FoodEntry, Product } from '../domain/nutrition'

const today = '2026-10-14'
const input = { date: today, kind: 'Синтетическая тренировка', minutes: 30, kcal: null, source: '', note: '' }
const connections: Dexie[] = []
let sequence = 0
function createDatabase(name = `health-diary-test-workouts-${String(++sequence)}`) {
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
})
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
})

it('добавляет несколько тренировок с новыми UUID, сохраняет null и ноль и разделяет даты', async () => {
  const database = createDatabase()
  expect(await listWorkouts(today, database)).toEqual([])
  const first = await addWorkout({ ...input, kind: '  Синтетическая ходьба  ', minutes: 0.5, kcal: 0, source: '  Синтетическая ручная оценка  ', note: '  Синтетическая заметка  ' }, database)
  const second = await addWorkout(input, database)
  const otherDay = await addWorkout({ ...input, date: '2026-10-13' }, database)
  expect({ ...first, id: '' }).toEqual({ ...input, id: '', kind: 'Синтетическая ходьба', minutes: 0.5, kcal: 0, source: 'Синтетическая ручная оценка', note: 'Синтетическая заметка' })
  expect(second.kcal).toBeNull()
  expect(new Set([first.id, second.id, otherDay.id]).size).toBe(3)
  for (const workout of [first, second, otherDay]) expect(workout.id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
  expect(await listWorkouts(today, database)).toEqual(expect.arrayContaining([first, second]))
  expect(await listWorkouts('2026-10-13', database)).toEqual([otherDay])
  expect(await listWorkouts('2026-10-12', database)).toEqual([])
  expect(await database.workouts.count()).toBe(3)
})

it('устойчиво сортирует одинаковые виды по UUID после повторного открытия базы', async () => {
  const database = createDatabase()
  const walking: Workout = { ...input, id: '00000000-0000-4000-8000-000000000003', kind: 'Синтетическая ходьба' }
  const later: Workout = { ...input, id: '00000000-0000-4000-8000-000000000002', kind: 'Синтетическая аэробика' }
  const earlier: Workout = { ...later, id: '00000000-0000-4000-8000-000000000001', source: 'Синтетический источник' }
  await database.workouts.bulkAdd([walking, later, earlier])
  expect(await listWorkouts(today, database)).toEqual([earlier, later, walking])
  database.close()
  expect(await listWorkouts(today, createDatabase(database.name))).toEqual([earlier, later, walking])
})

it('валидирует неизвестный ввод до записи и отклоняет будущий день, лишний ID и неверную дату чтения', async () => {
  const database = createDatabase()
  const original = await addWorkout(input, database)
  const add = vi.spyOn(database.workouts, 'add')
  for (const invalid of [null, { ...input, extra: true }, { ...input, id: original.id }, { ...input, minutes: 0 }, { ...input, kcal: Infinity }, { ...input, date: '2026-02-29' }]) {
    await expect(addWorkout(invalid, database)).rejects.toThrow()
  }
  await expect(addWorkout({ ...input, date: '2026-10-15' }, database)).rejects.toThrow(/в будущем/)
  expect(add).not.toHaveBeenCalled()
  add.mockRestore()
  for (const date of [null, '', '2026-02-29', 20261014, {}]) await expect(listWorkouts(date, database)).rejects.toThrow()
  expect(await listWorkouts(today, database)).toEqual([original])
})

it('не добавляет запись при отказе хранилища и отклоняет повреждённые записи при чтении', async () => {
  const database = createDatabase()
  const failure = () => { throw new Error('Синтетический отказ записи') }
  database.workouts.hook('creating', failure)
  await expect(addWorkout(input, database)).rejects.toThrow('Синтетический отказ записи')
  expect(await listWorkouts(today, database)).toEqual([])
  database.workouts.hook('creating').unsubscribe(failure)
  const original = await addWorkout(input, database)
  for (const corrupted of [{ ...original, minutes: '30' }, { ...original, kcal: NaN }, { ...original, extra: true }]) {
    await database.table<unknown, string>('workouts').put(corrupted)
    await expect(listWorkouts(today, database)).rejects.toThrow()
  }
})

it('мигрирует v6 в v7, сохраняя шаги и все предыдущие таблицы', async () => {
  const original = new Dexie(`health-diary-test-workouts-migration-${String(++sequence)}`)
  connections.push(original)
  original.version(1).stores({ metadata: 'id' })
  original.version(2).stores({ profiles: 'id', weights: 'id,&date' })
  original.version(3).stores({ products: 'id,name' })
  original.version(4).stores({ foodEntries: 'id,date,[date+meal]' })
  original.version(5).stores({ nutritionDays: 'date' })
  original.version(6).stores({ steps: 'date' })
  const profile: Profile = { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: null, formulaSex: 'none' }
  const weight: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-13', kg: 70 }
  const product: Product = { id: '00000000-0000-4000-8000-000000000002', name: 'Синтетический архив', source: '', kcal: 100, protein: null, fat: 0, carbs: 10, archived: true }
  const food: FoodEntry = {
    id: '00000000-0000-4000-8000-000000000003', date: weight.date, meal: 'breakfast', productId: product.id, grams: 150, note: '',
    snapshot: { name: 'Прежний синтетический продукт', source: 'Синтетическая этикетка', kcal: 150, protein: null, fat: 0, carbs: 10 },
  }
  const records: [string, unknown][] = [
    ['profiles', profile], ['weights', weight], ['products', product], ['foodEntries', food],
    ['nutritionDays', { date: weight.date, complete: false }], ['steps', { date: today, count: 0 }],
    ['metadata', { id: 'fixture', value: 'Синтетическая служебная запись' }],
  ]
  for (const [name, record] of records) await original.table<unknown, string>(name).add(record)
  original.close()
  const migrated = createDatabase(original.name)
  expect(await listWorkouts(today, migrated)).toEqual([])
  const workout = await addWorkout(input, migrated)
  for (const [name, record] of records) expect(await migrated.table<unknown, string>(name).toArray()).toEqual([record])
  expect(await listWorkouts(today, migrated)).toEqual([workout])
})

it('работает с тестовым singleton и местной текущей датой чтения по умолчанию', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  expect(await listWorkouts()).toEqual([])
  const workout = await addWorkout(input)
  const previousDay = await addWorkout({ ...input, date: '2026-10-13', kcal: 0 })
  expect(await listWorkouts()).toEqual([workout])
  expect(await listWorkouts('2026-10-13')).toEqual([previousDay])
})

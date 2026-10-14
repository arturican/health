import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Profile, type Weight } from '../domain/profile'
import { db, DiaryDatabase } from './db'
import { createProfile, getProfile } from './profileRepository'

const profile: Profile = {
  id: 'self', name: 'Синтетический профиль', heightCm: 170,
  birthDate: '2000-01-01', formulaSex: 'none',
}
const weight: Weight = {
  id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', kg: 70,
}
const names = new Set<string>()
const connections = new Set<DiaryDatabase>()
let sequence = 0

function createDatabase() {
  const name = `health-diary-test-profile-repository-${String(++sequence)}`
  names.add(name)
  const database = new DiaryDatabase(name)
  connections.add(database)
  return database
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
})

afterEach(async () => {
  for (const database of connections) database.close()
  await Promise.all([...names].map(name => Dexie.delete(name)))
  connections.clear()
  names.clear()
  vi.useRealTimers()
})

describe('Чтение профиля', () => {
  it('возвращает null для отсутствующего профиля и проверенный профиль после записи', async () => {
    const database = createDatabase()
    expect(await getProfile(database)).toBeNull()

    await database.profiles.put(profile)
    expect(await getProfile(database)).toEqual(profile)
  })

  it('отклоняет повреждённые данные хранилища вместо приведения типов', async () => {
    const database = createDatabase()
    const corrupt = { ...profile, heightCm: '170' }
    await database.table<unknown, string>('profiles').put(corrupt)

    await expect(getProfile(database)).rejects.toThrow(/рост числом/)
    expect(await database.table<unknown, string>('profiles').get('self')).toEqual(corrupt)
  })

  it('использует тестовый singleton при вызовах без явной базы', async () => {
    expect(db.name).toBe('health-diary-tests')
    names.add(db.name)
    connections.add(db)
    expect(await getProfile()).toBeNull()

    await createProfile(profile, weight)
    expect(await getProfile()).toEqual(profile)
    expect(await db.weights.toArray()).toEqual([weight])
  })
})

describe('Атомарное создание профиля', () => {
  it('сохраняет профиль и первое измерение совместно, не меняя входные данные', async () => {
    const database = createDatabase()
    const input = { ...profile, name: '  Синтетический профиль  ' }
    await createProfile(input, weight, database)

    expect(await database.profiles.toArray()).toEqual([profile])
    expect(await database.weights.toArray()).toEqual([weight])
    expect(input.name).toBe('  Синтетический профиль  ')
  })

  it.each<{ profileInput: unknown; weightInput: unknown; error: RegExp }>([
    { profileInput: { ...profile, heightCm: '170' }, weightInput: weight, error: /рост числом/ },
    { profileInput: profile, weightInput: { ...weight, kg: 0 }, error: /больше нуля/ },
  ])('не записывает ни одну сущность при невалидном вводе', async ({ profileInput, weightInput, error }) => {
    const database = createDatabase()
    await expect(createProfile(profileInput, weightInput, database)).rejects.toThrow(error)

    expect(await database.profiles.count()).toBe(0)
    expect(await database.weights.count()).toBe(0)
  })

  it('не заменяет ранее созданный профиль или его первое измерение', async () => {
    const database = createDatabase()
    await createProfile(profile, weight, database)

    await expect(createProfile({ ...profile, name: 'Другой синтетический профиль' }, {
      ...weight, id: '00000000-0000-4000-8000-000000000002', date: '2026-10-13', kg: 71,
    }, database)).rejects.toThrow('Профиль уже создан')

    expect(await database.profiles.toArray()).toEqual([profile])
    expect(await database.weights.toArray()).toEqual([weight])
  })

  it('отклоняет будущую дату измерения до записи', async () => {
    const database = createDatabase()
    await expect(createProfile(profile, { ...weight, date: '2026-10-15' }, database))
      .rejects.toThrow('Дата измерения не может быть в будущем')

    expect(await database.profiles.count()).toBe(0)
    expect(await database.weights.count()).toBe(0)
  })

  it('отклоняет измерение раньше известной даты рождения до записи', async () => {
    const database = createDatabase()
    await expect(createProfile(profile, { ...weight, date: '1999-12-31' }, database))
      .rejects.toThrow('Дата измерения раньше даты рождения')

    expect(await database.profiles.count()).toBe(0)
    expect(await database.weights.count()).toBe(0)
  })

  it.each<{ birthDate: string | null; date: string }>([
    { birthDate: '2000-01-01', date: '2000-01-01' },
    { birthDate: null, date: '1999-12-31' },
  ])('допускает дату рождения как границу или неизвестную дату рождения', async ({ birthDate, date }) => {
    const database = createDatabase()
    await createProfile({ ...profile, birthDate }, { ...weight, date }, database)

    expect(await getProfile(database)).toEqual({ ...profile, birthDate })
    expect(await database.weights.toArray()).toEqual([{ ...weight, date }])
  })

  it('откатывает новый профиль при конфликте даты веса и сохраняет прежнее измерение', async () => {
    const database = createDatabase()
    const existing = { ...weight, id: '00000000-0000-4000-8000-000000000002', kg: 72 }
    await database.weights.add(existing)

    await expect(createProfile(profile, weight, database)).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await getProfile(database)).toBeNull()
    expect(await database.weights.toArray()).toEqual([existing])
  })

  it('откатывает профиль при ошибке второго добавления без изменения прежних записей', async () => {
    const database = createDatabase()
    const existing = { ...weight, id: '00000000-0000-4000-8000-000000000002', date: '2026-10-13' }
    await database.weights.add(existing)
    database.weights.hook('creating', () => {
      throw new Error('Синтетическая ошибка сохранения веса')
    })

    await expect(createProfile(profile, weight, database)).rejects.toThrow('Синтетическая ошибка сохранения веса')
    expect(await getProfile(database)).toBeNull()
    expect(await database.weights.toArray()).toEqual([existing])
  })
})

import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Profile, type Weight } from '../domain/profile'
import { db, DiaryDatabase } from './db'
import { deleteWeight, latestWeight, listWeights, saveWeight, updateWeight } from './weightRepository'

const profile: Profile = {
  id: 'self', name: 'Синтетический профиль', heightCm: 170,
  birthDate: '2000-01-01', formulaSex: 'none',
}
const first: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-12', kg: 70 }
const second: Weight = { id: '00000000-0000-4000-8000-000000000002', date: '2026-10-14', kg: 71 }
const missingId = '00000000-0000-4000-8000-000000000003'
const names = new Set<string>()
const connections = new Set<DiaryDatabase>()
let sequence = 0

function createDatabase(name = `health-diary-test-weight-repository-${String(++sequence)}`) {
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

describe('История измерений веса', () => {
  it('обновляет вес той же даты без нового id и сохраняет историю после повторного открытия', async () => {
    const database = createDatabase()
    await database.profiles.put(profile)
    await saveWeight({ date: first.date, kg: 70 }, database)
    const original = await latestWeight(first.date, database)
    if (!original) throw new Error('Сохранённое измерение не найдено')
    await saveWeight({ date: first.date, kg: 70.5 }, database)
    expect(await listWeights(first.date, database)).toEqual([{ ...original, kg: 70.5 }])
    await saveWeight({ date: second.date, kg: 71 }, database)
    const latest = await latestWeight(second.date, database)
    if (!latest) throw new Error('Последнее измерение не найдено')
    await updateWeight(latest.id, { date: '2026-10-13', kg: 71.5 }, database)
    database.close()

    const reopened = createDatabase(database.name)
    expect(await listWeights('2026-10-14', reopened)).toEqual([
      { ...latest, date: '2026-10-13', kg: 71.5 }, { ...original, kg: 70.5 },
    ])
    expect(await latestWeight(first.date, reopened)).toEqual({ ...original, kg: 70.5 })
    await deleteWeight(latest.id, reopened)
    await deleteWeight(latest.id, reopened)
    expect(await reopened.weights.toArray()).toEqual([{ ...original, kg: 70.5 }])
  })

  it('не затирает чужую дату и отклоняет отсутствующее измерение или неверный id', async () => {
    const database = createDatabase()
    await database.profiles.put(profile)
    await database.weights.bulkAdd([first, second])
    await expect(updateWeight(first.id, { date: second.date, kg: 75 }, database))
      .rejects.toThrow('На эту дату уже есть измерение')
    await expect(updateWeight(missingId, { date: first.date, kg: 75 }, database))
      .rejects.toThrow('Измерение не найдено')
    await expect(updateWeight('fixture', { date: first.date, kg: 75 }, database)).rejects.toThrow(/идентификатор/)
    await expect(deleteWeight('fixture', database)).rejects.toThrow(/идентификатор/)
    expect(await database.weights.toArray()).toEqual([first, second])

    await updateWeight(first.id, { date: first.date, kg: 75 }, database)
    expect(await database.weights.get(first.id)).toEqual({ ...first, kg: 75 })
    expect(await database.weights.get(second.id)).toEqual(second)
  })

  it('требует профиль и проверяет внешний ввод без частичных записей', async () => {
    const database = createDatabase()
    await expect(saveWeight({ date: first.date, kg: 70 }, database)).rejects.toThrow('Сначала создайте профиль')
    await database.profiles.put(profile)
    const invalidInputs: unknown[] = [
      null, { date: first.date, kg: '70' }, { date: first.date, kg: 0 },
      { date: first.date, kg: 70, id: first.id }, { date: '2026-02-29', kg: 70 },
    ]
    for (const input of invalidInputs) {
      await expect(saveWeight(input, database)).rejects.toThrow(/[А-Яа-яЁё]/)
    }
    await database.weights.add(first)
    await expect(updateWeight(first.id, { date: first.date, kg: 70, extra: true }, database))
      .rejects.toThrow('Неизвестные поля записи')
    expect(await database.weights.toArray()).toEqual([first])
  })

  it('отклоняет будущие даты и даты до рождения, сохраняя включительные границы', async () => {
    const database = createDatabase()
    await database.profiles.put(profile)
    await expect(saveWeight({ date: '2026-10-15', kg: 70 }, database)).rejects.toThrow(/в будущем/)
    await expect(saveWeight({ date: '1999-12-31', kg: 70 }, database)).rejects.toThrow(/раньше даты рождения/)
    expect(await database.weights.count()).toBe(0)
    await saveWeight({ date: profile.birthDate, kg: 0.1 }, database)
    await saveWeight({ date: '2026-10-14', kg: 600 }, database)
    expect(await database.weights.count()).toBe(2)
    await database.profiles.put({ ...profile, birthDate: null })
    await saveWeight({ date: '1999-12-31', kg: 70 }, database)
    expect(await database.weights.count()).toBe(3)
  })

  it('выбирает последнее измерение только на указанную дату и проверяет календарный фильтр', async () => {
    const database = createDatabase()
    expect(await listWeights(first.date, database)).toEqual([])
    expect(await latestWeight(first.date, database)).toBeNull()
    await database.weights.bulkAdd([second, first])
    expect(await listWeights(first.date, database)).toEqual([first])
    expect(await latestWeight('2026-10-11', database)).toBeNull()
    expect(await listWeights(second.date, database)).toEqual([second, first])
    await expect(listWeights('2026-02-29', database)).rejects.toThrow(/не существует/)
  })

  it('не меняет сохранённый вес при ошибке записи во время upsert или переноса даты', async () => {
    const database = createDatabase()
    await database.profiles.put(profile)
    await database.weights.add(first)
    database.weights.hook('updating', () => {
      throw new Error('Синтетическая ошибка хранилища')
    })
    await expect(saveWeight({ date: first.date, kg: 75 }, database)).rejects.toThrow('Синтетическая ошибка хранилища')
    await expect(updateWeight(first.id, { date: '2026-10-13', kg: 75 }, database))
      .rejects.toThrow('Синтетическая ошибка хранилища')
    expect(await database.weights.toArray()).toEqual([first])
  })

  it('отклоняет повреждённые данные даже за пределами выбранного периода и не перезаписывает их', async () => {
    const database = createDatabase()
    await database.profiles.put(profile)
    const corrupt = { ...second, kg: '71' }
    await database.table<unknown, string>('weights').put(corrupt)
    await database.weights.add(first)
    await expect(listWeights(first.date, database)).rejects.toThrow(/вес числом/)
    await expect(latestWeight(first.date, database)).rejects.toThrow(/вес числом/)
    await expect(saveWeight({ date: second.date, kg: 75 }, database)).rejects.toThrow(/вес числом/)
    await expect(updateWeight(first.id, { date: second.date, kg: 75 }, database)).rejects.toThrow(/вес числом/)
    expect(await database.table<unknown, string>('weights').get(second.id)).toEqual(corrupt)
    expect(await database.weights.get(first.id)).toEqual(first)
  })

  it('использует тестовый singleton и текущую дату по умолчанию для полного цикла операций', async () => {
    expect(db.name).toBe('health-diary-tests')
    names.add(db.name)
    connections.add(db)
    await db.profiles.put(profile)
    expect(await listWeights()).toEqual([])
    expect(await latestWeight()).toBeNull()
    await saveWeight({ date: '2026-10-14', kg: 70 })
    const current = await latestWeight()
    if (!current) throw new Error('Измерение общей тестовой базы не найдено')
    await updateWeight(current.id, { date: '2026-10-13', kg: 71 })
    expect(await latestWeight()).toEqual({ ...current, date: '2026-10-13', kg: 71 })
    expect(await latestWeight('2026-10-12')).toBeNull()
    await deleteWeight(current.id)
    expect(await listWeights()).toEqual([])
  })
})

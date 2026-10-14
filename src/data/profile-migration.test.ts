import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DiaryDatabase, type Metadata } from './db'

const names = new Set<string>()
const connections = new Set<Dexie>()
let sequence = 0

function databaseName() {
  const name = `health-diary-test-profile-migration-${String(++sequence)}`
  names.add(name)
  return name
}

afterEach(async () => {
  for (const database of connections) database.close()
  await Promise.all([...names].map(name => Dexie.delete(name)))
  connections.clear()
  names.clear()
})

describe('Добавление профиля и измерений в локальную базу', () => {
  it('сохраняет metadata версии 1 и открывает новые таблицы после обновления', async () => {
    const name = databaseName()
    const legacy = new Dexie(name)
    connections.add(legacy)
    legacy.version(1).stores({ metadata: 'id' })
    await legacy.table<Metadata>('metadata').put({ id: 'fixture', value: 'Синтетическая запись' })
    legacy.close()

    const upgraded = new DiaryDatabase(name)
    connections.add(upgraded)
    await upgraded.open()
    expect(await upgraded.metadata.get('fixture')).toEqual({ id: 'fixture', value: 'Синтетическая запись' })
    expect(await upgraded.profiles.count()).toBe(0)
    expect(await upgraded.weights.count()).toBe(0)

    const profile = {
      id: 'self' as const, name: 'Синтетический профиль', heightCm: 170,
      birthDate: null, formulaSex: 'none' as const,
    }
    const weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', kg: 70 }
    await upgraded.profiles.put(profile)
    await upgraded.weights.put(weight)
    expect(await upgraded.profiles.get('self')).toEqual(profile)
    expect(await upgraded.weights.get(weight.id)).toEqual(weight)
  })

  it('не допускает два измерения с разными id на одну дату', async () => {
    const database = new DiaryDatabase(databaseName())
    connections.add(database)
    const first = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', kg: 70 }
    await database.weights.add(first)

    await expect(database.weights.add({
      ...first, id: '00000000-0000-4000-8000-000000000002', kg: 71,
    })).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await database.weights.toArray()).toEqual([first])
  })
})

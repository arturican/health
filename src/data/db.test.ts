import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { db, DiaryDatabase } from './db'

const names = new Set<string>()
const connections = new Set<DiaryDatabase>()
let sequence = 0

function createDatabase(name = `health-diary-test-metadata-${String(++sequence)}`) {
  names.add(name)
  const database = new DiaryDatabase(name)
  connections.add(database)
  return database
}

afterEach(async () => {
  for (const database of connections) database.close()
  await Promise.all([...names].map(name => Dexie.delete(name)))
  connections.clear()
  names.clear()
})

describe('Локальная база дневника', () => {
  it('использует отдельное имя общей базы в тестовом окружении', () => {
    expect(db.name).toBe('health-diary-tests')
  })

  it('сохраняет запись после закрытия и повторного открытия той же базы', async () => {
    const original = createDatabase()
    await original.metadata.put({ id: 'fixture', value: 'Синтетическая запись' })
    original.close()

    const reopened = createDatabase(original.name)
    expect(await reopened.metadata.get('fixture')).toEqual({
      id: 'fixture', value: 'Синтетическая запись',
    })
  })

  it('обновляет запись с тем же id без создания дубликата', async () => {
    const database = createDatabase()
    await database.metadata.put({ id: 'fixture', value: 'Первое значение' })
    await database.metadata.put({ id: 'fixture', value: 'Обновлённое значение' })

    expect(await database.metadata.get('fixture')).toEqual({
      id: 'fixture', value: 'Обновлённое значение',
    })
    expect(await database.metadata.count()).toBe(1)
  })

  it('полностью откатывает обновления и новые записи при ошибке транзакции', async () => {
    const database = createDatabase()
    await database.metadata.put({ id: 'existing', value: 'До изменения' })

    await expect(database.transaction('rw', database.metadata, async () => {
      await database.metadata.put({ id: 'existing', value: 'Незавершённое изменение' })
      await database.metadata.put({ id: 'new', value: 'Незавершённая новая запись' })
      throw new Error('Синтетическая ошибка транзакции')
    })).rejects.toThrow('Синтетическая ошибка транзакции')

    expect(await database.metadata.get('existing')).toEqual({ id: 'existing', value: 'До изменения' })
    expect(await database.metadata.get('new')).toBeUndefined()
    expect(await database.metadata.count()).toBe(1)
  })

  it('изолирует записи баз с разными именами', async () => {
    const first = createDatabase()
    const second = createDatabase()
    await first.metadata.put({ id: 'fixture', value: 'Первая база' })
    expect(await second.metadata.get('fixture')).toBeUndefined()

    await second.metadata.put({ id: 'fixture', value: 'Вторая база' })
    expect(await first.metadata.get('fixture')).toEqual({ id: 'fixture', value: 'Первая база' })
    expect(await second.metadata.get('fixture')).toEqual({ id: 'fixture', value: 'Вторая база' })
  })
})

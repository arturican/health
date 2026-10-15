import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { addProduct, archiveProduct } from './productRepository'
import { exportTextBackup, restoreTextBackup } from './backupRepository'
import { exportFullBackup } from './fullBackupRepository'
import { BACKUP_MAX_RECORDS, serializeTextBackup, type TextBackup } from '../domain/backup'

const database = new DiaryDatabase('health-diary-test-record-boundary')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  database.close()
  await Dexie.delete(database.name)
  vi.useRealTimers()
})

it('реальные 100000 продуктов после импорта остаются экспортируемыми, а продукт 100001 не сохраняется', async () => {
  expect(BACKUP_MAX_RECORDS).toBe(100000)
  const products = Array.from({ length: BACKUP_MAX_RECORDS }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: 'А', source: '', kcal: 0, protein: null, fat: null, carbs: null, archived: false,
  }))
  const input: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile: null, weights: [], products, foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [],
  }
  await restoreTextBackup(input, database)
  const extra = { ...products[0], id: 'ffffffff-0000-4000-8000-000000000001' }
  await expect(addProduct(extra, database)).rejects.toThrow(/лимит/i)
  expect(await database.products.get(extra.id)).toBeUndefined()
  const first = products[0]
  if (!first) throw new Error('Синтетический каталог пуст')
  await archiveProduct(first.id, true, database)
  const text = await exportTextBackup(database)
  expect(text.products).toHaveLength(BACKUP_MAX_RECORDS)
  expect(text.products.find(product => product.id === first.id)).toEqual({ ...first, archived: true })
  expect(new TextEncoder().encode(serializeTextBackup(text)).byteLength).toBeLessThanOrEqual(20 * 1024 * 1024)
  const full = await exportFullBackup(database)
  expect(full.text).toEqual(text)
  expect(full.metadata).toEqual([])
  expect(await database.products.count()).toBe(BACKUP_MAX_RECORDS)
}, 30000)

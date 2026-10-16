import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { addProduct, archiveProduct } from './productRepository'
import { exportTextBackup, restoreTextBackup } from './backupRepository'
import { exportFullBackup } from './fullBackupRepository'
import { BACKUP_MAX_RECORDS, readTextBackup, serializeTextBackup, TEXT_BACKUP_MAX_BYTES, type TextBackup } from '../domain/backup'

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

// This 100k-record correctness/byte-boundary test is not a performance SLA.
// Coverage on shared CI runners needs a bounded budget beyond the local ~19 s.
it('реальные 100000 продуктов после импорта остаются экспортируемыми, а продукт 100001 не сохраняется', async () => {
  expect(BACKUP_MAX_RECORDS).toBe(100000)
  const products = Array.from({ length: BACKUP_MAX_RECORDS }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: 'Синтетический продукт', source: '', kcal: 0, protein: null, fat: null, carbs: null, archived: false,
  }))
  const input: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile: null, weights: [], products, foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [],
  }
  const encoder = new TextEncoder()
  expect(encoder.encode(JSON.stringify(input)).byteLength).toBeLessThan(TEXT_BACKUP_MAX_BYTES)
  expect(encoder.encode(JSON.stringify(input, null, 2)).byteLength).toBeGreaterThan(TEXT_BACKUP_MAX_BYTES)
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
  const serialized = serializeTextBackup(text)
  expect(encoder.encode(serialized).byteLength).toBeLessThanOrEqual(TEXT_BACKUP_MAX_BYTES)
  expect(readTextBackup(JSON.parse(serialized))).toEqual(text)
  const full = await exportFullBackup(database)
  expect(full.text).toEqual(text)
  expect(full.metadata).toEqual([])
  expect(await database.products.count()).toBe(BACKUP_MAX_RECORDS)

  const remaining = TEXT_BACKUP_MAX_BYTES - encoder.encode(serialized).byteLength
  const perProduct = Math.floor(remaining / BACKUP_MAX_RECORDS)
  const remainder = remaining % BACKUP_MAX_RECORDS
  const boundary = { ...text, products: text.products.map((product, index) => ({
    ...product, source: 'A'.repeat(perProduct + (index < remainder ? 1 : 0)),
  })) }
  const exact = serializeTextBackup(boundary)
  expect(encoder.encode(exact).byteLength).toBe(TEXT_BACKUP_MAX_BYTES)
  expect(readTextBackup(JSON.parse(exact))).toEqual(boundary)
  const boundaryFirst = boundary.products[0]
  if (!boundaryFirst) throw new Error('Синтетический каталог пуст')
  boundaryFirst.source += 'A'
  expect(encoder.encode(JSON.stringify(boundary)).byteLength).toBe(TEXT_BACKUP_MAX_BYTES + 1)
  expect(() => serializeTextBackup(boundary)).toThrow('Текстовая копия превышает 20 MiB')
}, 90000)

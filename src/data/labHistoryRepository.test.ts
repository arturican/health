import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from './db'
import { listLabHistory } from './labHistoryRepository'

const source = { id: '00000000-0000-4000-8000-000000000001', fileId: '00000000-0000-4000-8000-000000000002', date: '2026-10-14', title: 'Учебный бланк', kind: 'lab' as const, note: '' }
const result = { id: '00000000-0000-4000-8000-000000000003', documentId: source.id, date: source.date, name: 'Учебный показатель', unit: 'усл. ед.', value: { type: 'number' as const, operator: 'eq' as const, number: 0 }, reference: '', note: '' }
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  await Promise.all([db.documents.clear(), db.labResults.clear()])
})
afterEach(async () => { await Promise.all([db.documents.clear(), db.labResults.clear()]); vi.useRealTimers() })

it('читает источники и ряды без изменения записей, отражает правку и удаление', async () => {
  expect(await listLabHistory()).toEqual({ documents: [], series: [] })
  await db.documents.add(source); await db.labResults.add(result)
  expect(await listLabHistory(db)).toMatchObject({ documents: [source], series: [{ entries: [result] }] })
  await db.labResults.update(result.id, { unit: 'новые ед.' })
  expect((await listLabHistory()).series[0]?.unit).toBe('новые ед.')
  await db.labResults.delete(result.id)
  expect((await listLabHistory()).series).toEqual([])
  expect(await db.documents.get(source.id)).toEqual(source)
})

it('не скрывает потерянный источник или повреждённую запись', async () => {
  await db.labResults.add(result)
  await expect(listLabHistory()).rejects.toThrow('Не найден документ-источник')
  await db.documents.add(source)
  await db.table<unknown, string>('labResults').put({ ...result, unit: 42 })
  await expect(listLabHistory()).rejects.toThrow()
})

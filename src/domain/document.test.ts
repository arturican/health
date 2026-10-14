import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readDocument, readDocumentInput } from './document'

const input = { date: '2026-10-14', title: '  Синтетический бланк  ', kind: 'lab', note: '  Пример  ' }
const record = { ...input, id: '00000000-0000-4000-8000-000000000001', fileId: '00000000-0000-4000-8000-000000000002' }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 12)) })
afterEach(() => { vi.useRealTimers() })

it.each(['lab', 'report', 'imaging', 'other'])('принимает категорию %s и очищает пробелы без изменения исходника', kind => {
  const frozen = Object.freeze({ ...record, kind })
  expect(readDocument(frozen)).toMatchObject({ title: 'Синтетический бланк', note: 'Пример', kind })
  expect(frozen.title).toBe(input.title)
  expect(readDocumentInput({ ...input, kind })).toMatchObject({ kind, title: 'Синтетический бланк' })
})

it.each([
  { title: '' }, { title: 'x'.repeat(161) }, { note: 'x'.repeat(501) },
  { kind: 'unknown' }, { date: '2026-02-30' }, { date: '2026-10-15' }, { extra: true },
])('отвергает неправильные метаданные %j', change => {
  expect(() => readDocumentInput({ ...input, ...change })).toThrow()
  expect(() => readDocument({ ...record, ...change })).toThrow()
})

it('проверяет неизвестный ввод, UUID и граничную длину полей', () => {
  for (const value of [null, [], 1]) expect(() => readDocumentInput(value)).toThrow()
  expect(() => readDocument({ ...record, id: 'wrong' })).toThrow()
  expect(() => readDocument({ ...record, fileId: null })).toThrow()
  expect(readDocumentInput({ ...input, title: 'x'.repeat(160), note: 'x'.repeat(500) })).toMatchObject({ title: 'x'.repeat(160), note: 'x'.repeat(500) })
})

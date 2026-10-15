import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatLabValue, readLabInput, readLabResult } from './labResult'

const input = {
  documentId: '00000000-0000-4000-8000-000000000001', date: '2026-10-14',
  name: '  Синтетический показатель  ', value: { type: 'number', number: 0, operator: 'eq' },
  unit: '  условная ед.  ', reference: '  Как на синтетическом бланке  ', note: '  Пример  ',
}
const record = { ...input, id: '00000000-0000-4000-8000-000000000002' }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 12)) })
afterEach(() => { vi.useRealTimers() })

it.each([
  [{ type: 'number', number: 0, operator: 'eq' }, '0'],
  [{ type: 'number', number: -0.000001, operator: 'lt' }, '< -0,000001'],
  [{ type: 'number', number: 1.23456789, operator: 'lte' }, '≤ 1,23456789'],
  [{ type: 'number', number: 1000, operator: 'gt' }, '> 1000'],
  [{ type: 'number', number: -5, operator: 'gte' }, '≥ -5'],
  [{ type: 'text', text: '  Не обнаружено  ' }, 'Не обнаружено'],
])('сохраняет знак/точность и не интерпретирует результат %j', (value, expected) => {
  const frozen = Object.freeze({ ...record, value: Object.freeze(value) })
  const result = readLabResult(frozen)
  expect(result).toMatchObject({ name: 'Синтетический показатель', unit: 'условная ед.', reference: 'Как на синтетическом бланке', note: 'Пример' })
  expect(formatLabValue(result.value)).toBe(expected)
  expect(frozen.name).toBe(input.name)
})

it.each([
  { type: 'number', number: NaN, operator: 'eq' }, { type: 'number', number: Infinity, operator: 'eq' },
  { type: 'number', number: '1,2', operator: 'eq' }, { type: 'number', number: 1, operator: 'unknown' },
  { type: 'number', number: 1 }, { type: 'text', text: ' ' },
  { type: 'text', text: 'x'.repeat(121) }, { type: 'text', text: 'negative', number: 1 }, null,
])('отвергает некорректный или неоднозначный результат %j', value => {
  expect(() => readLabInput({ ...input, value })).toThrow()
  expect(() => formatLabValue(value)).toThrow()
})

it.each([
  { documentId: 'wrong' }, { date: '2026-10-15' }, { date: '2026-02-30' },
  { name: ' ' }, { name: 'x'.repeat(121) }, { unit: 'x'.repeat(41) },
  { reference: 'x'.repeat(161) }, { note: 'x'.repeat(501) }, { extra: true },
])('отвергает неверные метаданные %j', change => {
  expect(() => readLabInput({ ...input, ...change })).toThrow()
  expect(() => readLabResult({ ...record, ...change })).toThrow()
})

it('принимает отсутствие единиц/референса и проверяет ID/неизвестный ввод', () => {
  expect(readLabInput({ ...input, unit: '', reference: '', note: '' })).toMatchObject({ unit: '', reference: '', note: '' })
  expect(() => readLabResult({ ...record, id: 'invalid' })).toThrow()
  for (const value of [null, [], 'result']) expect(() => readLabInput(value)).toThrow()
})

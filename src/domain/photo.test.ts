import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readPhoto, readPhotoInput } from './photo'

const values = { date: '2026-10-14', title: '  Синтетический кадр  ', note: '  Пример  ' }
const photo = { ...values, id: '00000000-0000-4000-8000-000000000001', fileId: '00000000-0000-4000-8000-000000000002', width: 2048, height: 1 }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 12)) })
afterEach(() => { vi.useRealTimers() })

it('сохраняет дату, очищает пробелы и принимает граничные размеры', () => {
  expect(readPhotoInput(values)).toEqual({ date: '2026-10-14', title: 'Синтетический кадр', note: 'Пример' })
  expect(readPhoto(photo)).toMatchObject({ width: 2048, height: 1, title: 'Синтетический кадр' })
  expect(readPhoto({ ...photo, width: 1, height: 2048 })).toMatchObject({ width: 1, height: 2048 })
})

it.each([
  { title: '' }, { title: ' '.repeat(10) }, { title: 'x'.repeat(121) },
  { note: 'x'.repeat(501) }, { date: '2026-02-30' }, { date: '2026-10-15' },
  { date: 20261014 }, { extra: true },
])('отвергает неверные метаданные %j', change => {
  expect(() => readPhotoInput({ ...values, ...change })).toThrow()
  expect(() => readPhoto({ ...photo, ...change })).toThrow()
})

it.each([
  { width: 0 }, { height: 2049 }, { width: 1.5 }, { height: Infinity },
  { id: 'wrong' }, { fileId: null },
])('отвергает неверную сохранённую запись %j', change => {
  expect(() => readPhoto({ ...photo, ...change })).toThrow()
})

it('не принимает неизвестный ввод и не изменяет исходный объект', () => {
  for (const value of [null, [], 'photo']) expect(() => readPhotoInput(value)).toThrow()
  const frozen = Object.freeze({ ...photo })
  readPhoto(frozen)
  expect(frozen.title).toBe(values.title)
})

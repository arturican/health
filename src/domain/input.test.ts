import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageOn, localDate, parseDate, parseNumber } from './input'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('parseNumber', () => {
  it.each<{ input: string; expected: number }>([
    { input: ' 12.5 ', expected: 12.5 },
    { input: '12,5', expected: 12.5 },
    { input: '+12', expected: 12 },
    { input: '-12,5', expected: -12.5 },
    { input: '.5', expected: 0.5 },
    { input: '+,5', expected: 0.5 },
    { input: '-.5', expected: -0.5 },
    { input: '0', expected: 0 },
  ])('разбирает $input', ({ input, expected }) => {
    expect(parseNumber(input)).toBe(expected)
  })

  it('отличает пустой необязательный ввод от введённого нуля', () => {
    expect(parseNumber(' \t ', { optional: true })).toBeNull()
    expect(parseNumber('0', { optional: true })).toBe(0)
    expect(() => parseNumber('')).toThrow()
    expect(() => parseNumber(' ', { optional: false })).toThrow()
  })

  it.each(['1 000', '1_000', '1,234.5', '1e3', '0x10', 'NaN', 'Infinity', '--1', '12kg', '1.', '.', '1,2,3'])(
    'отклоняет неверный числовой формат %s', input => {
      expect(() => parseNumber(input)).toThrow()
    },
  )

  it('отклоняет переполнение даже при корректном десятичном формате', () => {
    expect(() => parseNumber('9'.repeat(400))).toThrow(/конечным/)
  })

  it('принимает включительные границы, в том числе нулевую', () => {
    expect(parseNumber('-2', { min: -2, max: 2 })).toBe(-2)
    expect(parseNumber('2', { min: -2, max: 2 })).toBe(2)
    expect(parseNumber('0', { min: 0, max: 0 })).toBe(0)
    expect(parseNumber('1', { min: 0, max: 2 })).toBe(1)
  })

  it('отклоняет значения за нижней и верхней границей', () => {
    expect(() => parseNumber('-0.1', { min: 0 })).toThrow(/не меньше/)
    expect(() => parseNumber('0.1', { max: 0 })).toThrow(/не больше/)
  })

  it('требует целое число только при соответствующем ограничении', () => {
    expect(parseNumber('5.0', { integer: true })).toBe(5)
    expect(parseNumber('5.5', { integer: false })).toBe(5.5)
    expect(() => parseNumber('5.5', { integer: true })).toThrow(/целое/)
  })
})

describe('parseDate', () => {
  it.each(['2026-10-14', '2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31'])(
    'сохраняет валидную календарную дату %s', date => {
      expect(parseDate(date)).toBe(date)
    },
  )

  it.each(['', '2026-1-01', '14/10/2026', ' 2026-10-14 ', '2026-10-14T00:00:00Z'])(
    'отклоняет неверный формат даты %s', date => {
      expect(() => parseDate(date)).toThrow(/формате/)
    },
  )

  it.each(['2026-13-01', '2026-00-01', '2026-01-32', '2026-04-31', '2026-02-29', '1900-02-29', '0000-01-01'])(
    'отклоняет несуществующую календарную дату %s', date => {
      expect(() => parseDate(date)).toThrow(/не существует/)
    },
  )
})

describe('localDate', () => {
  it.each<{ timezone: string; expected: string }>([
    { timezone: 'Europe/Moscow', expected: '2026-01-02' },
    { timezone: 'America/Los_Angeles', expected: '2026-01-01' },
  ])('использует календарный день в $timezone, а не UTC', ({ timezone, expected }) => {
    vi.stubEnv('TZ', timezone)
    expect(localDate(new Date('2026-01-01T23:30:00Z'))).toBe(expected)
  })

  it('без аргумента использует текущий локальный день', () => {
    vi.stubEnv('TZ', 'Europe/Moscow')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T23:30:00Z'))
    expect(localDate()).toBe('2026-01-02')
  })

  it.each(['0001-01-02', '0099-01-02', '9999-01-02'])(
    'форматирует допустимый год четырьмя цифрами: %s', expected => {
      vi.stubEnv('TZ', 'UTC')
      expect(localDate(new Date(`${expected}T12:00:00Z`))).toBe(expected)
    },
  )

  it.each(['не дата', '0000-01-01T12:00:00Z', '+010000-01-01T12:00:00Z'])(
    'отклоняет невалидный момент или недопустимый год %s', value => {
      vi.stubEnv('TZ', 'UTC')
      expect(() => localDate(new Date(value))).toThrow(/Некорректная дата/)
    },
  )
})

describe('ageOn', () => {
  it.each<{ birth: string; on: string; expected: number }>([
    { birth: '2000-10-14', on: '2026-10-13', expected: 25 },
    { birth: '2000-10-14', on: '2026-10-14', expected: 26 },
    { birth: '2000-10-14', on: '2026-10-15', expected: 26 },
    { birth: '2026-10-14', on: '2026-10-14', expected: 0 },
    { birth: '2000-02-29', on: '2024-02-28', expected: 23 },
    { birth: '2000-02-29', on: '2024-02-29', expected: 24 },
    { birth: '2000-02-29', on: '2025-02-28', expected: 24 },
    { birth: '2000-02-29', on: '2025-03-01', expected: 25 },
  ])('вычисляет возраст для $birth на $on', ({ birth, on, expected }) => {
    expect(ageOn(birth, on)).toBe(expected)
  })

  it('отклоняет дату рождения после даты расчёта', () => {
    expect(() => ageOn('2026-10-15', '2026-10-14')).toThrow(/позже/)
  })

  it('проверяет календарную корректность обеих дат', () => {
    expect(() => ageOn('1900-02-29', '2026-10-14')).toThrow()
    expect(() => ageOn('2000-02-29', '2026-02-29')).toThrow()
  })
})

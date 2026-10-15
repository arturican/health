import { expect, it } from 'vitest'
import { exactNumber } from './exactNumber'

it.each([
  [0, '0'],
  [70, '70'],
  [12345, '12345'],
  [12.5, '12,5'],
  [-0.125, '-0,125'],
  [170.123456789, '170,123456789'],
  [0.0000001, '0,0000001'],
  [0.30000000000000004, '0,30000000000000004'],
])('показывает исходное число %s без округления: %s', (value, expected) => {
  expect(exactNumber(value)).toBe(expected)
})

it('сохраняет точное значение конечных чисел без группировки и экспоненты', () => {
  const values = [
    Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE,
    Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
    Number.EPSILON, 1.0000000000000002, 123456789.12345679,
    1.2345678901234567e-100, 1.2345678901234567e100, -0,
  ]
  const before = [...values]
  for (const value of values) {
    const displayed = exactNumber(value)
    expect(displayed).toMatch(/^-?\d+(?:,\d+)?$/)
    expect(Number(displayed.replace(',', '.'))).toBe(value)
  }
  expect(values).toEqual(before)
})

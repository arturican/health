import { expect, it } from 'vitest'
import { adultBmiCategory, calculateBmi } from './bmi'

it('переводит сантиметры в метры, не округляет результат и не подменяет отсутствие нулём', () => {
  expect(calculateBmi(72, 180)).toBeCloseTo(22.2222222222, 9)
  expect(calculateBmi(70.5, 170.5)).toBeCloseTo(24.25159742348277, 9)
  expect(calculateBmi(null, 180)).toBeNull()
  expect(calculateBmi(72, null)).toBeNull()
  expect(calculateBmi(null, null)).toBeNull()
})

it.each([0, -1, NaN, Infinity, 601])('отклоняет некорректный вес %s', value => {
  expect(() => calculateBmi(value, 180)).toThrow()
})
it.each([0, -1, NaN, Infinity, 301, Number.MIN_VALUE])('отклоняет некорректный рост или численный результат %s', value => {
  expect(() => calculateBmi(72, value)).toThrow()
})

it.each([
  [18.499999, 'below'], [18.5, 'reference'], [24.999999, 'reference'],
  [25, 'above'], [29.999999, 'above'], [30, 'high'], [45, 'high'],
] as const)('категория использует неокруглённую границу %s', (value, category) => {
  expect(adultBmiCategory(value, 20)).toBe(category)
})

it('не присваивает взрослую категорию без возраста или до 20 лет', () => {
  expect(adultBmiCategory(22, null)).toBeNull()
  expect(adultBmiCategory(22, 19)).toBeNull()
  expect(adultBmiCategory(22, 0)).toBeNull()
  expect(adultBmiCategory(null, 20)).toBeNull()
  expect(adultBmiCategory(22, 80)).toBe('reference')
  for (const invalid of [NaN, Infinity, -1, 0]) expect(() => adultBmiCategory(invalid, 20)).toThrow(/ИМТ/)
  for (const invalid of [NaN, Infinity, -1, 19.5]) expect(() => adultBmiCategory(22, invalid)).toThrow(/возраст/)
})

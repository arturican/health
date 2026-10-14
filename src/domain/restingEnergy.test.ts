import { describe, expect, it } from 'vitest'
import { calculateRestingEnergy, restingInputSchema } from './restingEnergy'

const input = { kg: 70, heightCm: 170, age: 30, formulaSex: 'male' }

describe('Оценка расхода в покое', () => {
  it.each([{ formulaSex: 'male', expected: 1617.5 }, { formulaSex: 'female', expected: 1451.5 }])('подтверждает пример Mifflin для $formulaSex', ({ formulaSex, expected }) => {
    expect(calculateRestingEnergy({ ...input, formulaSex })).toBe(expected)
  })

  it.each([{ age: 19, expected: 1672.5 }, { age: 78, expected: 1377.5 }])('принимает включительную возрастную границу $age', ({ age, expected }) => {
    expect(calculateRestingEnergy({ ...input, age })).toBe(expected)
  })

  it.each([0, 18, 79, 200, 9998])('при допустимом календарном возрасте %s вне области формулы возвращает null', age => {
    const values = { ...input, age }
    expect(restingInputSchema.parse(values)).toEqual(values)
    expect(calculateRestingEnergy(values)).toBeNull()
  })

  it.each(['kg', 'heightCm', 'age'])('не подставляет ноль вместо отсутствующего параметра %s', field => {
    expect(calculateRestingEnergy({ ...input, [field]: null })).toBeNull()
  })

  it('не предполагает параметр формулы при none', () => {
    expect(calculateRestingEnergy({ ...input, formulaSex: 'none' })).toBeNull()
  })

  it('принимает технические верхние границы веса и роста', () => {
    expect(calculateRestingEnergy({ ...input, kg: 600, heightCm: 300 })).toBe(7730)
  })

  it('сохраняет дробный результат без промежуточного или итогового округления', () => {
    expect(calculateRestingEnergy({ ...input, kg: 70.125, heightCm: 170.125 })).toBe(1619.53125)
    expect(calculateRestingEnergy({ ...input, kg: 1.0625, heightCm: 16, age: 23 })).toBe(0.625)
  })

  it.each([{ kg: 1, heightCm: 16, age: 23, formulaSex: 'male' }, { kg: 1, heightCm: 1, age: 30, formulaSex: 'female' }])('возвращает null для нулевой или отрицательной оценки', values => {
    expect(calculateRestingEnergy(values)).toBeNull()
  })

  it.each<{ field: keyof typeof input; value: unknown }>([
    { field: 'kg', value: 0 }, { field: 'kg', value: -1 }, { field: 'kg', value: 600.1 },
    { field: 'kg', value: NaN }, { field: 'kg', value: Infinity }, { field: 'kg', value: -Infinity }, { field: 'kg', value: '70' },
    { field: 'heightCm', value: 0 }, { field: 'heightCm', value: -1 }, { field: 'heightCm', value: 300.1 },
    { field: 'heightCm', value: NaN }, { field: 'heightCm', value: Infinity }, { field: 'heightCm', value: -Infinity }, { field: 'heightCm', value: '170' },
    { field: 'age', value: -1 }, { field: 'age', value: 30.5 }, { field: 'age', value: 9999 }, { field: 'age', value: Number.MAX_SAFE_INTEGER + 1 },
    { field: 'age', value: NaN }, { field: 'age', value: Infinity }, { field: 'age', value: -Infinity }, { field: 'age', value: '30' },
    { field: 'formulaSex', value: 'unknown' }, { field: 'formulaSex', value: null }, { field: 'formulaSex', value: true },
  ])('отклоняет некорректное поле $field = $value', ({ field, value }) => {
    const values = { ...input, [field]: value }
    expect(restingInputSchema.safeParse(values).success).toBe(false)
    expect(() => calculateRestingEnergy(values)).toThrow()
  })

  it.each(['kg', 'heightCm', 'age', 'formulaSex'])('требует присутствия поля %s, в том числе для неизвестных значений', field => {
    const values = Object.fromEntries<unknown>(Object.entries(input).filter(([key]) => key !== field))
    expect(() => calculateRestingEnergy(values)).toThrow()
  })

  it.each<{ value: unknown }>([{ value: null }, { value: undefined }, { value: [] }, { value: 0 }])('отклоняет значение другого типа', ({ value }) => {
    expect(() => calculateRestingEnergy(value)).toThrow()
  })

  it('проверяет весь ввод до обработки отсутствия данных или неподходящего возраста', () => {
    for (const values of [{ ...input, kg: null, heightCm: 0 }, { ...input, formulaSex: 'none', age: NaN }, { ...input, age: 18, kg: 0 }]) {
      expect(() => calculateRestingEnergy(values)).toThrow()
    }
    expect(() => calculateRestingEnergy({ ...input, extra: true })).toThrow('Неизвестные поля записи')
  })
})

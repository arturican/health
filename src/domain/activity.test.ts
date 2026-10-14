import { describe, expect, it } from 'vitest'
import { readSteps, stepsSchema } from './activity'

const date = '2026-10-14'

describe('Итог шагов из внешних данных', () => {
  it.each([0, 1, 12500, 999999, 1000000])('сохраняет допустимое целое количество %s и дату без преобразования', count => {
    const input = { date, count }
    expect(stepsSchema.parse(input)).toEqual(input)
    expect(readSteps(input)).toEqual(input)
  })

  it.each(['2026-10-01', '2024-02-29', '2000-02-29'])('принимает календарную дату %s с явным нулём', date => {
    expect(readSteps({ date, count: 0 })).toEqual({ date, count: 0 })
  })

  it.each([-1, 0.5, 1.5, 1000001, NaN, Infinity, -Infinity, null, undefined, '0', '', true])('отклоняет неверное количество %s', count => {
    const input = { date, count }
    expect(stepsSchema.safeParse(input).success).toBe(false)
    expect(() => readSteps(input)).toThrow()
  })

  it.each(['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-01-00', '0000-01-01', '2026-1-01', '14.10.2026', '2026-10-14T12:00:00Z', ''])('отклоняет неверную календарную дату %s', date => {
    expect(() => readSteps({ date, count: 0 })).toThrow('Некорректная календарная дата')
  })

  it.each<{ label: string; input: unknown }>([
    { label: 'отсутствующая запись null', input: null },
    { label: 'отсутствующая запись undefined', input: undefined },
    { label: 'отсутствующие поля', input: {} },
    { label: 'отсутствующее количество', input: { date } },
    { label: 'отсутствующая дата', input: { count: 0 } },
    { label: 'нестроковая дата', input: { date: null, count: 0 } },
    { label: 'массив', input: [] },
    { label: 'число вместо записи', input: 0 },
  ])('отклоняет $label без подстановки нулевого итога', ({ input }) => {
    expect(stepsSchema.safeParse(input).success).toBe(false)
    expect(() => readSteps(input)).toThrow()
  })

  it('отклоняет неизвестные поля без их молчаливого удаления', () => {
    const input = { date, count: 0, extra: 'Синтетическое поле' }
    expect(stepsSchema.safeParse(input).success).toBe(false)
    expect(() => readSteps(input)).toThrow('Неизвестные поля записи')
  })
})

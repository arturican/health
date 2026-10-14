import { describe, expect, it } from 'vitest'
import { readSteps, readWorkout, stepsSchema, workoutInputSchema, workoutSchema } from './activity'

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

const workoutInput = { date, kind: 'Синтетическая тренировка', minutes: 30.5, kcal: null, source: 'Синтетическая ручная оценка', note: 'Учебная запись' }
const workout = { ...workoutInput, id: '00000000-0000-4000-8000-000000000001' }

describe('Тренировка из внешних данных', () => {
  it('принимает ввод без ID и проверяет новый UUID в полной записи', () => {
    const parsed = workoutInputSchema.parse(workoutInput)
    expect(parsed).toEqual(workoutInput)
    const id = '00000000-0000-4000-8000-000000000002'
    expect(workoutSchema.parse({ ...parsed, id })).toEqual({ ...workoutInput, id })
    expect(readWorkout({ ...parsed, id })).toEqual({ ...workoutInput, id })
    expect(() => readWorkout(parsed)).toThrow()
    expect(workoutInputSchema.safeParse({ ...workoutInput, id }).success).toBe(false)
  })

  it.each([0.1, 30.5, 1440])('сохраняет допустимую длительность %s без округления', minutes => {
    expect(readWorkout({ ...workout, minutes }).minutes).toBe(minutes)
  })

  it.each([null, 0, 0.1, 123.5, 100000])('сохраняет ручную оценку расхода %s без подстановки или расчёта', kcal => {
    expect(readWorkout({ ...workout, kcal }).kcal).toBe(kcal)
  })

  it('обрезает строки и принимает их верхние границы, не изменяя вход', () => {
    const values = { ...workout, kind: 'а'.repeat(80), minutes: 1440, kcal: 100000, source: 'б'.repeat(160), note: 'в'.repeat(500) }
    const input = { ...values, kind: `  ${values.kind}  `, source: `  ${values.source}  `, note: `  ${values.note}  ` }
    expect(readWorkout(input)).toEqual(values)
    expect(input.kind).toBe(`  ${values.kind}  `)
    expect(readWorkout({ ...workout, source: '  ', note: '  ' })).toMatchObject({ source: '', note: '' })
    expect(workoutInputSchema.parse({ ...workoutInput, kind: ' а ', source: '  ', note: '  ' })).toEqual({ ...workoutInput, kind: 'а', source: '', note: '' })
  })

  it('сохраняет високосную календарную дату без преобразования', () => {
    expect(readWorkout({ ...workout, date: '2000-02-29' }).date).toBe('2000-02-29')
  })

  it.each<{ field: keyof typeof workout; value: unknown }>([
    { field: 'id', value: 'invalid' }, { field: 'id', value: null },
    { field: 'date', value: '2026-02-29' }, { field: 'date', value: null },
    { field: 'kind', value: '' }, { field: 'kind', value: '  ' }, { field: 'kind', value: 'а'.repeat(81) }, { field: 'kind', value: 123 },
    { field: 'minutes', value: 0 }, { field: 'minutes', value: -1 }, { field: 'minutes', value: 1440.1 },
    { field: 'minutes', value: NaN }, { field: 'minutes', value: Infinity }, { field: 'minutes', value: -Infinity },
    { field: 'minutes', value: null }, { field: 'minutes', value: '30' },
    { field: 'kcal', value: -1 }, { field: 'kcal', value: 100000.1 }, { field: 'kcal', value: NaN },
    { field: 'kcal', value: Infinity }, { field: 'kcal', value: -Infinity }, { field: 'kcal', value: '0' },
    { field: 'source', value: 'а'.repeat(161) }, { field: 'source', value: null },
    { field: 'note', value: 'а'.repeat(501) }, { field: 'note', value: null },
  ])('отклоняет неверное поле $field = $value', ({ field, value }) => {
    expect(() => readWorkout({ ...workout, [field]: value })).toThrow()
    expect(workoutInputSchema.safeParse({ ...workoutInput, [field]: value }).success).toBe(false)
  })

  it.each(['date', 'kind', 'minutes', 'kcal', 'source', 'note'])('не подставляет значение вместо отсутствующего поля %s', field => {
    const input = Object.fromEntries<unknown>(Object.entries(workoutInput).filter(([key]) => key !== field))
    expect(workoutInputSchema.safeParse(input).success).toBe(false)
    expect(() => readWorkout({ ...input, id: workout.id })).toThrow()
  })

  it.each<{ input: unknown }>([{ input: null }, { input: undefined }, { input: [] }, { input: 'Синтетическая запись' }])('отклоняет значение другого типа', ({ input }) => {
    expect(() => readWorkout(input)).toThrow()
    expect(workoutInputSchema.safeParse(input).success).toBe(false)
  })

  it('отклоняет неизвестные поля полной записи и ввода', () => {
    expect(() => readWorkout({ ...workout, extra: true })).toThrow('Неизвестные поля записи')
    expect(workoutInputSchema.safeParse({ ...workoutInput, extra: true }).success).toBe(false)
  })
})

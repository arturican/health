import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { energyPlanInputSchema, energyPlanSchema, readEnergyPlan, readEnergyPlanInput, type EnergyPlan, type EnergyPlanInput } from './energyPlan'

const input: EnergyPlanInput = { effectiveFrom: '2026-10-14', goalKcal: null, method: 'none', manualKcal: null, factor: null, source: '' }
const plan: EnergyPlan = {
  ...input, id: '00000000-0000-4000-8000-000000000001', revision: 1, createdOn: '2026-10-14', restingFormula: 'mifflin-st-jeor-1990',
  snapshot: { kg: 70, weightDate: '2026-10-13', heightCm: 170, age: 30, formulaSex: 'male' },
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('Ввод энергетического плана', () => {
  it.each<Pick<EnergyPlanInput, 'method' | 'manualKcal' | 'factor'>>([
    { method: 'none', manualKcal: null, factor: null },
    { method: 'manual', manualKcal: 0, factor: null }, { method: 'manual', manualKcal: 100000, factor: null },
    { method: 'factor', manualKcal: null, factor: 0.1 }, { method: 'factor', manualKcal: null, factor: 10 },
  ])('принимает выбранный метод $method без примеси другого метода', parameters => {
    const values = { ...input, ...parameters }
    expect(readEnergyPlanInput(values)).toEqual(values)
    expect(readEnergyPlan({ ...plan, ...parameters })).toEqual({ ...plan, ...parameters })
  })

  it.each([null, 0, 0.25, 100000])('сохраняет цель %s независимо от оценки расхода', goalKcal => {
    expect(readEnergyPlanInput({ ...input, goalKcal })).toEqual({ ...input, goalKcal })
  })

  it.each<Pick<EnergyPlanInput, 'method' | 'manualKcal' | 'factor'>>([
    { method: 'none', manualKcal: 0, factor: null }, { method: 'none', manualKcal: null, factor: 1 }, { method: 'none', manualKcal: 0, factor: 1 },
    { method: 'manual', manualKcal: null, factor: null }, { method: 'manual', manualKcal: 0, factor: 1 }, { method: 'manual', manualKcal: null, factor: 1 },
    { method: 'factor', manualKcal: null, factor: null }, { method: 'factor', manualKcal: 0, factor: 1 }, { method: 'factor', manualKcal: 0, factor: null },
  ])('отклоняет несогласованные параметры метода $method', parameters => {
    expect(() => readEnergyPlanInput({ ...input, ...parameters })).toThrow('Заполните только параметры выбранного способа оценки расхода')
    expect(() => readEnergyPlan({ ...plan, ...parameters })).toThrow('Заполните только параметры выбранного способа оценки расхода')
  })

  it('обрезает источник и принимает включительную границу его длины', () => {
    const source = 'а'.repeat(160)
    expect(readEnergyPlanInput({ ...input, source: `  ${source}  ` }).source).toBe(source)
    expect(readEnergyPlan({ ...plan, source: '  Синтетический источник  ' }).source).toBe('Синтетический источник')
  })

  it.each<{ field: keyof EnergyPlanInput; value: unknown }>([
    { field: 'effectiveFrom', value: '2026-02-29' }, { field: 'effectiveFrom', value: null },
    { field: 'goalKcal', value: -1 }, { field: 'goalKcal', value: 100000.1 }, { field: 'goalKcal', value: NaN }, { field: 'goalKcal', value: Infinity }, { field: 'goalKcal', value: '0' },
    { field: 'manualKcal', value: -1 }, { field: 'manualKcal', value: 100000.1 }, { field: 'manualKcal', value: NaN }, { field: 'manualKcal', value: Infinity }, { field: 'manualKcal', value: '0' },
    { field: 'factor', value: 0 }, { field: 'factor', value: -1 }, { field: 'factor', value: 10.1 }, { field: 'factor', value: NaN }, { field: 'factor', value: Infinity }, { field: 'factor', value: '1' },
    { field: 'method', value: 'other' }, { field: 'method', value: null }, { field: 'source', value: null }, { field: 'source', value: 'а'.repeat(161) },
  ])('отклоняет неверное поле $field', ({ field, value }) => {
    expect(() => readEnergyPlanInput({ ...input, [field]: value })).toThrow()
    expect(() => readEnergyPlan({ ...plan, [field]: value })).toThrow()
  })

  it.each(['effectiveFrom', 'goalKcal', 'method', 'manualKcal', 'factor', 'source'])('требует присутствия поля %s', field => {
    const values = Object.fromEntries<unknown>(Object.entries(input).filter(([key]) => key !== field))
    expect(() => readEnergyPlanInput(values)).toThrow()
  })
})

describe('Сохранённая версия энергетического плана', () => {
  it.each([
    { createdOn: '2026-10-14', effectiveFrom: '2026-10-14', weightDate: '2026-10-14' },
    { createdOn: '2000-02-29', effectiveFrom: '2000-03-01', weightDate: '2000-02-28' },
    { createdOn: '2026-10-14', effectiveFrom: '2026-12-01', weightDate: '2026-10-13' },
  ])('принимает согласованные даты начала $effectiveFrom и создания $createdOn', ({ createdOn, effectiveFrom, weightDate }) => {
    expect(readEnergyPlanInput({ ...input, effectiveFrom }).effectiveFrom).toBe(effectiveFrom)
    const values = { ...plan, createdOn, effectiveFrom, snapshot: { ...plan.snapshot, weightDate } }
    expect(readEnergyPlan(values)).toEqual(values)
  })

  it.each([1, Number.MAX_SAFE_INTEGER])('сохраняет допустимый revision %s', revision => {
    expect(readEnergyPlan({ ...plan, revision }).revision).toBe(revision)
  })

  it('сохраняет неизвестный снимок без подстановки нулей', () => {
    const snapshot = { kg: null, weightDate: null, heightCm: null, age: null, formulaSex: 'none' }
    expect(readEnergyPlan({ ...plan, snapshot }).snapshot).toEqual(snapshot)
  })

  it.each([
    { ...plan.snapshot, kg: null }, { ...plan.snapshot, weightDate: null }, { ...plan.snapshot, weightDate: '2026-10-15' },
  ])('отклоняет несогласованные значение и дату веса', snapshot => {
    expect(() => readEnergyPlan({ ...plan, snapshot })).toThrow('Дата и значение веса в снимке не согласованы')
  })

  it('сравнивает дату веса с созданием версии, а не с сегодняшним днём', () => {
    expect(() => readEnergyPlan({ ...plan, createdOn: '2026-10-12' })).toThrow('Дата и значение веса в снимке не согласованы')
  })

  it.each<{ field: keyof EnergyPlan; value: unknown }>([
    { field: 'id', value: 'invalid' }, { field: 'id', value: null },
    { field: 'revision', value: 0 }, { field: 'revision', value: -1 }, { field: 'revision', value: 1.5 }, { field: 'revision', value: Number.MAX_SAFE_INTEGER + 1 },
    { field: 'revision', value: NaN }, { field: 'revision', value: Infinity }, { field: 'revision', value: '1' },
    { field: 'createdOn', value: '2026-10-15' }, { field: 'createdOn', value: '2026-02-29' }, { field: 'createdOn', value: null },
    { field: 'effectiveFrom', value: '2026-10-13' }, { field: 'restingFormula', value: 'other' }, { field: 'snapshot', value: null },
    { field: 'snapshot', value: { ...plan.snapshot, kg: 0 } }, { field: 'snapshot', value: { ...plan.snapshot, age: 0.5 } },
    { field: 'snapshot', value: { ...plan.snapshot, weightDate: '2026-02-29' } },
  ])('отклоняет неверное поле версии $field', ({ field, value }) => {
    expect(() => readEnergyPlan({ ...plan, [field]: value })).toThrow()
  })

  it.each(['id', 'revision', 'createdOn', 'restingFormula', 'snapshot'])('требует поле версии %s', field => {
    const values = Object.fromEntries<unknown>(Object.entries(plan).filter(([key]) => key !== field))
    expect(() => readEnergyPlan(values)).toThrow()
  })

  it('отклоняет лишние поля ввода, версии и вложенного снимка', () => {
    expect(energyPlanInputSchema.safeParse({ ...input, id: plan.id }).success).toBe(false)
    expect(energyPlanSchema.safeParse({ ...plan, extra: true }).success).toBe(false)
    expect(() => readEnergyPlanInput({ ...input, extra: true })).toThrow('Неизвестные поля записи')
    expect(() => readEnergyPlan({ ...plan, extra: true })).toThrow('Неизвестные поля записи')
    expect(() => readEnergyPlan({ ...plan, snapshot: { ...plan.snapshot, extra: true } })).toThrow('Неизвестные поля записи')
  })

  it.each<{ value: unknown }>([{ value: null }, { value: undefined }, { value: [] }, { value: 'Синтетическая версия' }])('отклоняет значение другого типа', ({ value }) => {
    expect(() => readEnergyPlanInput(value)).toThrow()
    expect(() => readEnergyPlan(value)).toThrow()
  })
})

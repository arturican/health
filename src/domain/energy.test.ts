import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateEnergyDay, calculateExpenditure } from './energy'
import type { EnergyPlan } from './energyPlan'

const plan: EnergyPlan = {
  id: '00000000-0000-4000-8000-000000000001', revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-14',
  goalKcal: 1800, method: 'none', manualKcal: null, factor: null, source: 'Синтетическая оценка', restingFormula: 'mifflin-st-jeor-1990',
  snapshot: { kg: 70, weightDate: '2026-10-13', heightCm: 170, age: 30, formulaSex: 'male' },
}
const day = { goalKcal: 1800, intakeKcal: 1500, expenditureKcal: 2264.5, complete: true }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('Общая оценка расхода', () => {
  it('возвращает null при none, даже когда параметры покоя известны', () => {
    expect(calculateExpenditure(plan)).toBeNull()
  })
  it.each([0, 0.125, 2000, 100000])('сохраняет ручную оценку %s без прибавления цели или расхода в покое', manualKcal => {
    expect(calculateExpenditure({ ...plan, method: 'manual', manualKcal })).toBe(manualKcal)
  })
  it('использует только снимок покоя и коэффициент, без округления', () => {
    expect(calculateExpenditure({ ...plan, method: 'factor', factor: 1.4 })).toBe(2264.5)
    expect(calculateExpenditure({ ...plan, method: 'factor', factor: 1.125, snapshot: { ...plan.snapshot, kg: 70.125, heightCm: 170.125 } })).toBe(1821.97265625)
  })
  it.each([
    { ...plan.snapshot, kg: null, weightDate: null }, { ...plan.snapshot, heightCm: null },
    { ...plan.snapshot, age: null }, { ...plan.snapshot, formulaSex: 'none' },
  ])('возвращает null при недостающих параметрах покоя', snapshot => {
    expect(calculateExpenditure({ ...plan, method: 'factor', factor: 1.4, snapshot })).toBeNull()
    expect(calculateExpenditure({ ...plan, method: 'manual', manualKcal: 0, snapshot })).toBe(0)
  })
  it('проверяет полную версию плана до выбора метода', () => {
    for (const input of [null, { ...plan, extra: true }, { ...plan, method: 'manual', manualKcal: NaN }]) {
      expect(() => calculateExpenditure(input)).toThrow()
    }
  })
})

describe('Остаток цели и суточный баланс', () => {
  it.each([
    { label: 'полный день', input: day, expected: { goalRemaining: 300, balance: 764.5 } },
    { label: 'неполный день', input: { ...day, complete: false }, expected: { goalRemaining: 300, balance: null } },
    { label: 'отрицательные разности', input: { ...day, intakeKcal: 2500 }, expected: { goalRemaining: -700, balance: -235.5 } },
    { label: 'явные нули', input: { ...day, goalKcal: 0, intakeKcal: 0, expenditureKcal: 0 }, expected: { goalRemaining: 0, balance: 0 } },
    { label: 'неизвестная цель', input: { ...day, goalKcal: null }, expected: { goalRemaining: null, balance: 764.5 } },
    { label: 'неизвестный расход', input: { ...day, expenditureKcal: null }, expected: { goalRemaining: 300, balance: null } },
    { label: 'неизвестная еда', input: { ...day, intakeKcal: null }, expected: { goalRemaining: null, balance: null } },
    { label: 'неполный день с нулевой едой', input: { ...day, intakeKcal: 0, complete: false }, expected: { goalRemaining: 1800, balance: null } },
  ])('считает независимые значения: $label', ({ input, expected }) => {
    expect(calculateEnergyDay(input)).toEqual(expected)
  })
  it('сохраняет дробные разности и не ограничивает суммарную еду пределом плана', () => {
    expect(calculateEnergyDay({ goalKcal: 0.125, intakeKcal: 0.0625, expenditureKcal: 0.25, complete: true })).toEqual({ goalRemaining: 0.0625, balance: 0.1875 })
    expect(calculateEnergyDay({ ...day, intakeKcal: 250000 })).toEqual({ goalRemaining: -248200, balance: -247735.5 })
  })
  it.each(['goalKcal', 'intakeKcal', 'expenditureKcal'])('валидирует %s даже при неполном дне и неизвестной еде', field => {
    for (const value of [-1, NaN, Infinity, -Infinity, '0', true]) {
      expect(() => calculateEnergyDay({ ...day, intakeKcal: null, complete: false, [field]: value })).toThrow()
    }
  })
  it.each(['goalKcal', 'intakeKcal', 'expenditureKcal', 'complete'])('не подставляет отсутствующее поле %s', field => {
    const input = Object.fromEntries<unknown>(Object.entries(day).filter(([key]) => key !== field))
    expect(() => calculateEnergyDay(input)).toThrow()
  })
  it('отклоняет неboolean-полноту, неверный тип записи и лишние поля', () => {
    for (const input of [null, undefined, [], { ...day, complete: null }, { ...day, complete: 'true' }, { ...day, extra: true }]) {
      expect(() => calculateEnergyDay(input)).toThrow()
    }
  })
})

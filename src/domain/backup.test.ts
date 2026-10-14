import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readTextBackup, serializeTextBackup, type TextBackup } from './backup'
import type { Profile, Weight } from './profile'
import type { FoodEntry, Product } from './nutrition'
import type { EnergyPlan } from './energyPlan'

const sharedId = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const profile: Profile = { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: '2000-02-29', formulaSex: 'none' }
const weight: Weight = { id: sharedId, date: '2026-10-14', kg: 70.5 }
const product: Product = { id: sharedId, name: 'Синтетический архив', source: 'Синтетическая этикетка', kcal: 250, protein: 12, fat: null, carbs: 0, archived: true }
const food: FoodEntry = {
  id: sharedId, date: '2026-10-13', meal: 'lunch', productId: sharedId, grams: 150, note: 'Синтетическая запись',
  snapshot: { name: 'Историческое синтетическое название', source: 'Историческая синтетическая этикетка', kcal: 400, protein: 5, fat: null, carbs: 0 },
}
const empty: TextBackup = {
  format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
  profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [],
  steps: [], workouts: [], energyPlans: [],
}
const backup: TextBackup = {
  ...empty, profile, weights: [weight], products: [product], foodEntries: [food],
  nutritionDays: [{ date: '2026-10-14', complete: true }],
}
const workout = { id: sharedId, date: '2026-10-14', kind: 'Синтетическая прогулка', minutes: 30, kcal: null, source: '', note: '' }
const plan: EnergyPlan = {
  id: sharedId, revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-20',
  goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990',
  snapshot: { kg: null, weightDate: null, heightCm: null, age: null, formulaSex: 'none' },
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(() => { vi.useRealTimers() })

it('читает пустую и полную v1-копию, разрешая архив и совпадение ID разных таблиц', () => {
  expect(readTextBackup(empty)).toEqual(empty)
  expect(readTextBackup(backup)).toEqual(backup)
  const parsed: unknown = JSON.parse(serializeTextBackup(backup))
  expect(readTextBackup(parsed)).toEqual(backup)
})

it.each([
  { label: 'веса', input: { ...backup, weights: [weight, { ...weight, date: '2026-10-13' }] } },
  { label: 'продуктов', input: { ...backup, products: [product, { ...product, name: 'Другой синтетический продукт' }] } },
  { label: 'еды', input: { ...backup, foodEntries: [food, { ...food, date: '2026-10-12', note: 'Другая синтетическая запись' }] } },
])('отклоняет повторяющиеся ID внутри таблицы $label', ({ input }) => {
  expect(() => readTextBackup(input)).toThrow(/идентификаторы/)
})

it.each([
  { label: 'веса', input: { ...backup, weights: [weight, { ...weight, id: otherId, kg: 71 }] } },
  { label: 'полноты питания', input: { ...backup, nutritionDays: [{ date: '2026-10-14', complete: true }, { date: '2026-10-14', complete: false }] } },
])('отклоняет повторяющиеся календарные даты $label', ({ input }) => {
  expect(() => readTextBackup(input)).toThrow(/даты/)
})

it('требует профиль для истории веса и не принимает измерения раньше рождения', () => {
  expect(() => readTextBackup({ ...backup, profile: null })).toThrow(/нужен профиль/)
  expect(() => readTextBackup({ ...backup, weights: [{ ...weight, date: '2000-02-28' }] })).toThrow(/до даты рождения/)
  const onBirthday = { ...backup, weights: [{ ...weight, date: '2000-02-29' }] }
  expect(readTextBackup(onBirthday)).toEqual(onBirthday)
  const unknownBirthday = { ...backup, profile: { ...profile, birthDate: null }, weights: [{ ...weight, date: '1999-12-31' }] }
  expect(readTextBackup(unknownBirthday)).toEqual(unknownBirthday)
})

it.each([
  { label: 'веса', input: { ...backup, weights: [{ ...weight, date: '2026-10-15' }] } },
  { label: 'еды', input: { ...backup, foodEntries: [{ ...food, date: '2026-10-15' }] } },
  { label: 'полноты дня', input: { ...backup, nutritionDays: [{ date: '2026-10-15', complete: true }] } },
])('отклоняет будущие записи $label относительно местного текущего дня', ({ input }) => {
  expect(() => readTextBackup(input)).toThrow(/в будущем/)
})

it('проверяет ненулевую ссылку продукта, сохраняя самостоятельный снимок без ссылки', () => {
  expect(() => readTextBackup({ ...backup, foodEntries: [{ ...food, productId: otherId }] })).toThrow(/отсутствующий продукт/)
  const standalone = { ...empty, foodEntries: [{ ...food, productId: null }] }
  expect(readTextBackup(standalone)).toEqual(standalone)
})

it.each([
  { label: 'null', input: null },
  { label: 'строка JSON', input: JSON.stringify(backup) },
  { label: 'неизвестный формат', input: { ...backup, format: 'unknown' } },
  { label: 'неизвестная версия', input: { ...backup, version: 2 } },
  { label: 'неверное время экспорта', input: { ...backup, exportedAt: 'не дата' } },
  { label: 'лишнее верхнее поле', input: { ...backup, extra: true } },
  { label: 'лишнее поле профиля', input: { ...backup, profile: { ...profile, extra: true } } },
  { label: 'лишнее поле снимка', input: { ...backup, foodEntries: [{ ...food, snapshot: { ...food.snapshot, extra: true } }] } },
])('отклоняет нестрогую схему v1: $label', ({ input }) => {
  expect(() => readTextBackup(input)).toThrow()
})

it('не сериализует структурно корректные копии с недопустимыми связями, дублями и датами', () => {
  for (const input of [
    { ...backup, products: [] },
    { ...backup, products: [product, product] },
    { ...backup, nutritionDays: [{ date: '2026-10-15', complete: false }] },
  ]) {
    expect(() => serializeTextBackup(input)).toThrow()
  }
})

it('читает старую v1 без новых массивов как пустые и сериализует полную новую область', () => {
  const legacy = Object.fromEntries<unknown>(Object.entries(empty).filter(([key]) => !['steps', 'workouts', 'energyPlans'].includes(key)))
  expect(readTextBackup(legacy)).toEqual(empty)
  const all = { ...backup, steps: [{ date: '2026-10-14', count: 0 }], workouts: [workout], energyPlans: [plan] }
  expect(readTextBackup(JSON.parse(serializeTextBackup(all)))).toEqual(all)
})

it.each([
  { steps: [{ date: '2026-10-14', count: 0 }, { date: '2026-10-14', count: 1 }] },
  { steps: [{ date: '2026-10-15', count: 0 }] },
  { steps: [{ date: '2026-10-14', count: -1 }] },
  { workouts: [workout, workout] },
  { workouts: [{ ...workout, date: '2026-10-15' }] },
  { energyPlans: [plan, plan] },
  { energyPlans: [plan, { ...plan, id: otherId }] },
  { energyPlans: [{ ...plan, method: 'factor', factor: 1.4 }] },
  { energyPlans: [{ ...plan, createdOn: '2026-10-15' }] },
  { energyPlans: [{ ...plan, snapshot: { ...plan.snapshot, kg: 70 } }] },
  { energyPlans: [{ ...plan, snapshot: { ...plan.snapshot, kg: 70, weightDate: '2026-10-15' } }] },
])('отклоняет повреждённую активность или версии плана до восстановления', fields => {
  expect(() => readTextBackup({ ...empty, ...fields })).toThrow()
})

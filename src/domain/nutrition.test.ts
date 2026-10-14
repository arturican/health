import { expect, it } from 'vitest'
import { portion, readFoodEntry, readProduct } from './nutrition'

const snapshot = { name: 'Синтетический продукт', source: 'Тестовая этикетка', kcal: 250, protein: 12, fat: 10, carbs: 28 }
const product = { ...snapshot, id: '00000000-0000-4000-8000-000000000001', archived: false }
const entry = { id: '00000000-0000-4000-8000-000000000002', date: '2026-10-14', meal: 'lunch', productId: product.id, snapshot, grams: 150, note: '' }

it('масштабирует введённые данные на 100 г без округления и мутации', () => {
  expect(portion(Object.freeze(snapshot), 150)).toEqual({ kcal: 375, protein: 18, fat: 15, carbs: 42 })
  expect(portion(snapshot, 12.5)).toEqual({ kcal: 31.25, protein: 1.5, fat: 1.25, carbs: 3.5 })
  expect(snapshot.kcal).toBe(250)
})
it('сохраняет неизвестные БЖУ отдельно от явно введённых нулей', () => {
  expect(portion({ ...snapshot, kcal: 0, protein: null, fat: 0, carbs: null }, 100)).toEqual({ kcal: 0, protein: null, fat: 0, carbs: null })
  expect(portion({ ...snapshot, protein: 0, fat: null, carbs: 0 }, 100)).toMatchObject({ protein: 0, fat: null, carbs: 0 })
})
it.each([null, '', 0, -1, NaN, Infinity, 100001])('отклоняет некорректную массу порции %s', input => {
  expect(() => portion(snapshot, input)).toThrow()
})
it.each([null, { ...snapshot, kcal: -1 }, { ...snapshot, kcal: Infinity }, { ...snapshot, protein: 101 }, { ...snapshot, name: '' }, { ...snapshot, unknown: true }])('отклоняет некорректный снимок', input => {
  expect(() => portion(input, 100)).toThrow()
})
it('валидирует продукт и запись строго, сохраняя снимок отдельно от справочника', () => {
  expect(readProduct({ ...product, name: '  Синтетический продукт  ' })).toEqual(product)
  expect(readFoodEntry(entry)).toEqual(entry)
  expect(readProduct({ ...product, archived: true }).archived).toBe(true)
  for (const input of [{ ...product, id: 'bad' }, { ...product, source: 'x'.repeat(161) }, { ...product, fat: -1 }]) {
    expect(() => readProduct(input)).toThrow()
  }
  for (const input of [{ ...entry, date: '2026-02-29' }, { ...entry, meal: 'other' }, { ...entry, extra: true }, { ...entry, grams: null }, { ...entry, note: 'x'.repeat(501) }]) {
    expect(() => readFoodEntry(input)).toThrow()
  }
  expect(readFoodEntry({ ...entry, productId: null }).productId).toBeNull()
  expect(portion(snapshot, 100000).kcal).toBe(250000)
})

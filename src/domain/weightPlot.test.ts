import { expect, it } from 'vitest'
import { weightPlot } from './weightPlot'
import type { Weight } from './profile'

function weight(date: string, kg: number, sequence = 1): Weight {
  return { id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, date, kg }
}

it('размещает точки по настоящим интервалам календаря и обратной шкале веса, сортируя копию', () => {
  const late = Object.freeze(weight('2026-04-01', 70, 3))
  const middle = Object.freeze(weight('2026-03-29', 75, 2))
  const early = Object.freeze(weight('2026-03-28', 80))
  const original = Object.freeze([late, early, middle])
  expect(weightPlot(original)).toEqual({
    minimum: 70, maximum: 80,
    points: [{ ...early, x: 40, y: 40 }, { ...middle, x: 170, y: 120 }, { ...late, x: 560, y: 200 }],
  })
  expect(original).toEqual([late, early, middle])
  expect(Object.hasOwn(early, 'x')).toBe(false)
})

it.each([
  ['2026-03-07', '2026-03-08', '2026-03-09'],
  ['2026-03-28', '2026-03-29', '2026-03-30'],
  ['2026-10-24', '2026-10-25', '2026-10-26'],
])('оставляет равные календарные интервалы равными возле смены часового пояса: %s', (start, middle, end) => {
  const result = weightPlot([weight(start, 70), weight(middle, 71, 2), weight(end, 72, 3)])
  expect(result.points.map(point => point.x)).toEqual([40, 300, 560])
})

it('поддерживает ранние годы и различает обычный и високосный календарь', () => {
  const ordinary = weightPlot([weight('0001-02-28', 1), weight('0001-03-01', 2, 2), weight('0001-03-02', 3, 3)])
  const leap = weightPlot([weight('0004-02-28', 1), weight('0004-02-29', 2, 2), weight('0004-03-01', 3, 3)])
  expect(ordinary.points.map(point => point.x)).toEqual([40, 300, 560])
  expect(leap.points.map(point => point.x)).toEqual([40, 300, 560])
  expect(() => weightPlot([weight('0001-02-29', 1)])).toThrow()
  expect(() => weightPlot([weight('1900-02-29', 1)])).toThrow()
})

it('возвращает неизвестные границы для пустой истории, а одну точку ставит в центр', () => {
  expect(weightPlot([])).toEqual({ points: [], minimum: null, maximum: null })
  const entry = weight('2026-10-14', 70.25)
  expect(weightPlot([entry])).toEqual({ points: [{ ...entry, x: 300, y: 120 }], minimum: 70.25, maximum: 70.25 })
})

it('сохраняет равный вес на средней линии без деления на ноль', () => {
  const result = weightPlot([weight('2026-10-12', 0.25), weight('2026-10-14', 0.25, 2)])
  expect(result.minimum).toBe(0.25)
  expect(result.maximum).toBe(0.25)
  expect(result.points.map(point => [point.x, point.y])).toEqual([[40, 120], [560, 120]])
})

it('даёт конечные координаты на технических границах календаря и массы', () => {
  const result = weightPlot([weight('0001-01-01', Number.MIN_VALUE), weight('9999-12-31', 600, 2)])
  expect(result.minimum).toBe(Number.MIN_VALUE)
  expect(result.maximum).toBe(600)
  expect(result.points.map(point => [point.x, point.y])).toEqual([[40, 200], [560, 40]])
  expect(result.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
})

it('проверяет неизвестный вход до построения геометрии и отвергает дубли ID или дат', () => {
  const entry = weight('2026-10-14', 70)
  const invalid: unknown[] = [
    null, {}, [null], [{ ...entry, kg: '70' }], [{ ...entry, kg: NaN }], [{ ...entry, kg: 0 }],
    [{ ...entry, date: '2026-02-30' }], [{ ...entry, extra: true }],
  ]
  for (const input of invalid) expect(() => weightPlot(input)).toThrow()
  expect(() => weightPlot([entry, { ...entry, id: weight(entry.date, 70, 2).id }])).toThrow('Повторяющиеся даты веса')
  expect(() => weightPlot([entry, { ...entry, date: '2026-10-13' }])).toThrow('Повторяющиеся идентификаторы веса')
})

it('отвергает массив больше документированного технического предела', () => {
  expect(() => weightPlot(Array.from({ length: 100001 }, () => weight('2026-10-14', 70)))).toThrow(/100000/)
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { groupLabResults, labPlot, type LabSeries } from './labPlot'
import type { LabResult } from './labResult'

function result(index: number, changes: Partial<LabResult> = {}): LabResult {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, documentId: '00000000-0000-4000-8000-000000000099', date: `2026-10-${String(index).padStart(2, '0')}`, name: 'Учебный показатель', unit: 'усл. ед.', value: { type: 'number', operator: 'eq', number: index }, reference: '', note: '', ...changes }
}
function series(entries: LabResult[]): LabSeries {
  const value = groupLabResults(entries)[0]
  if (!value) throw new Error('Нужен учебный ряд')
  return value
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

it('разделяет точные названия и единицы, сортирует даты без изменения входа', () => {
  const entries = [result(3), result(1), result(2, { unit: 'другие ед.' }), result(4, { name: 'Другой показатель' })]
  const original = structuredClone(entries)
  const groups = groupLabResults(entries)
  expect(groups).toHaveLength(3)
  expect(groups.find(group => group.name === 'Учебный показатель' && group.unit === 'усл. ед.')?.entries.map(entry => entry.date)).toEqual(['2026-10-01', '2026-10-03'])
  expect(entries).toEqual(original)
  expect(groupLabResults([])).toEqual([])
})

it('сохраняет календарные интервалы, ноль и отрицательные значения', () => {
  const plot = labPlot(series([result(1, { value: { type: 'number', operator: 'eq', number: -10 } }), result(2, { value: { type: 'number', operator: 'eq', number: 0 } }), result(11, { value: { type: 'number', operator: 'eq', number: 10 } })]))
  expect(plot.points.map(point => point.value)).toEqual([-10, 0, 10])
  expect(plot.points.map(point => point.x)).toEqual([40, 92, 560])
  expect(plot.points.map(point => point.y)).toEqual([200, 120, 40])
  expect(plot.segments).toHaveLength(2)
})

it('не рисует точку или соединение через текст, границу и неоднозначную дату', () => {
  const entries = [result(1), result(2, { value: { type: 'text', text: 'Не определён' } }), result(3), result(4, { value: { type: 'number', operator: 'lt', number: 4 } }), result(5), result(6, { date: '2026-10-05' }), result(7)]
  const plot = labPlot(series(entries))
  expect(plot.points).toHaveLength(5)
  expect(plot.segments).toEqual([])
  expect(plot.entries).toHaveLength(7)
  expect(labPlot(series([result(1, { unit: '' })])).points).toEqual([])
  expect(labPlot(series([entries[1] ?? result(1)]))).toMatchObject({ minimum: null, maximum: null, points: [] })
})

it('одна точка и постоянный ряд не создают ложного диапазона', () => {
  const point = result(1)
  expect(labPlot(series([point]))).toMatchObject({ minimum: 1, maximum: 1, segments: [], points: [{ x: 300, y: 120 }] })
  expect(labPlot(series([point, result(2, { value: point.value })])).points.map(value => value.y)).toEqual([120, 120])
  expect(labPlot({ key: '', name: '', unit: 'ед.', entries: [] }).points).toEqual([])
})

it('координаты конечны для крайних чисел и малых дробей', () => {
  for (const values of [[-Number.MAX_VALUE, Number.MAX_VALUE], [Number.MIN_VALUE, Number.MIN_VALUE * 2], [0, 0]]) {
    const plot = labPlot(series(values.map((number, index) => result(index + 1, { value: { type: 'number', operator: 'eq', number } }))))
    expect(plot.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  }
})

it('ограничивает отображение последними 100, сохраняя полное количество', () => {
  const entries = Array.from({ length: 101 }, (_, index) => result(index + 1, { date: '2026-10-01' }))
  const plot = labPlot(series(entries))
  expect(plot.total).toBe(101)
  expect(plot.entries).toHaveLength(100)
  expect(plot.entries[0]?.id).toBe(entries[1]?.id)
  expect(entries).toHaveLength(101)
})

it('отклоняет повреждённые записи, бесконечность и будущую дату', () => {
  expect(() => groupLabResults([{}])).toThrow()
  expect(() => groupLabResults([result(1, { value: { type: 'number', operator: 'eq', number: Infinity } })])).toThrow()
  expect(() => groupLabResults([result(1, { date: '2026-10-16' })])).toThrow()
})

import { expect, it } from 'vitest'
import { activityDates, activityOverview } from './activityOverview'

it('строит календарную неделю через месяц, високосный день и границу года', () => {
  expect(activityDates('2024-03-02')).toEqual(['2024-02-25', '2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'])
  expect(activityDates('2026-01-02')[0]).toBe('2025-12-27')
  expect(activityDates('0001-01-01')).toEqual(['0001-01-01'])
  expect(activityDates('9999-12-31')).toHaveLength(7)
  expect(() => activityDates('2026-02-30')).toThrow()
})

it('отличает ноль от пропуска, ограничивает даты и складывает длительности', () => {
  const workout = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', kind: 'Учебная прогулка', minutes: 12.5, kcal: null, source: '', note: '' }
  const result = activityOverview('2026-10-14', [{ date: '2026-10-14', count: 0 }, { date: '2026-10-13', count: 1234 }, { date: '2026-10-15', count: 9000 }], [workout, { ...workout, minutes: 20 }, { ...workout, date: '2026-10-15' }])
  expect(result.steps).toBe(0)
  expect(result.days[0]?.count).toBeNull()
  expect(result.maximum).toBe(1234)
  expect(result.count).toBe(2)
  expect(result.minutes).toBe(32.5)
})

it('пустота не создаёт длительность или шаги, неверные значения отклоняются', () => {
  expect(activityOverview('2026-10-14', [], [])).toMatchObject({ count: 0, minutes: null, steps: null, maximum: 1 })
  expect(() => activityOverview('2026-10-14', [{ date: '2026-10-14', count: -1 }], [])).toThrow()
  expect(() => activityOverview('2026-10-14', [], [{}])).toThrow()
})

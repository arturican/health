import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { DayProvider } from '../ui/DayContext'
import { DayPicker } from '../ui/DayPicker'
import { TodayPage } from './TodayPage'

async function clear() { await db.transaction('rw', db.tables, async () => { await Promise.all(db.tables.map(table => table.clear())) }) }
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await clear()
})
afterEach(async () => { cleanup(); await clear(); vi.useRealTimers() })

it('собирает сводку из сохранённых данных и при смене дня не использует более поздний вес или активность', async () => {
  await db.profiles.add({ id: 'self', name: 'Синтетический профиль', heightCm: 180, birthDate: '1996-10-14', formulaSex: 'none' })
  await db.weights.bulkAdd([
    { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-12', kg: 72 },
    { id: '00000000-0000-4000-8000-000000000002', date: '2026-10-14', kg: 75 },
  ])
  await db.steps.add({ date: '2026-10-14', count: 0 })
  await db.workouts.bulkAdd([
    { id: '00000000-0000-4000-8000-000000000003', date: '2026-10-14', kind: 'Синтетическая прогулка', minutes: 30, kcal: null, source: '', note: '' },
    { id: '00000000-0000-4000-8000-000000000004', date: '2026-10-14', kind: 'Синтетическая разминка', minutes: 10, kcal: 0, source: '', note: '' },
  ])
  render(<DayProvider><DayPicker /><TodayPage /></DayProvider>)
  expect(await screen.findByText('75 кг, измерено 14.10.2026.')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Заполнить профиль' })).not.toBeInTheDocument()
  expect(await screen.findByText('Шаги: 0.')).toBeVisible()
  const activity = within(screen.getByRole('region', { name: 'Активность за день' }))
  expect(activity.getByText('30 мин; ручная оценка: нет данных')).toBeVisible()
  expect(activity.getByText('10 мин; ручная оценка: 0 ккал')).toBeVisible()
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value: '2026-10-13' } })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  expect(await screen.findByText('72 кг, измерено 12.10.2026.')).toBeVisible()
  expect(await activity.findByText('Шаги: нет данных.')).toBeVisible()
  expect(activity.queryByRole('list', { name: 'Сводка тренировок' })).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'ИМТ (справочно)' })).getByText('22,2')).toBeVisible()
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value: '2026-10-11' } })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  expect(await screen.findByText('Нет измерений не позже выбранного дня.')).toBeVisible()
  expect(screen.getByText('Нужны рост в профиле и измерение веса не позже даты оценки.')).toBeVisible()
  expect(await db.weights.count()).toBe(2)
})

it('сохраняет точность введённых веса и длительности в сводке, не превращая малое значение в ноль', async () => {
  await db.profiles.add({ id: 'self', name: '', heightCm: 170, birthDate: null, formulaSex: 'none' })
  await db.weights.add({ id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', kg: 0.0001 })
  await db.workouts.add({ id: '00000000-0000-4000-8000-000000000002', date: '2026-10-14', kind: 'Синтетическая граница точности', minutes: 0.0001, kcal: 0.0001, source: '', note: '' })
  render(<DayProvider><TodayPage /></DayProvider>)
  expect(await screen.findByText('0,0001 кг, измерено 14.10.2026.')).toBeVisible()
  expect(await screen.findByText('0,0001 мин; ручная оценка: 0,0001 ккал')).toBeVisible()
})

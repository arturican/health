import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EnergyPlanSettings } from './EnergyPlanSettings'
import { db } from '../data/db'
import * as repository from '../data/energyPlanRepository'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await Promise.all([db.energyPlans.clear(), db.profiles.clear(), db.weights.clear()])
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all([db.energyPlans.clear(), db.profiles.clear(), db.weights.clear()])
  vi.useRealTimers()
})
function open() { render(<EnergyPlanSettings />) }
function save() { fireEvent.click(screen.getByRole('button', { name: 'Сохранить новую версию' })) }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }

it('различает незаданную цель и ноль, сохраняет отдельную общую оценку новой версией и сбрасывает форму', async () => {
  open()
  expect(await screen.findByText('План пока не задан.')).toBeVisible()
  save()
  expect(await screen.findByText('Новая версия плана сохранена')).toBeVisible()
  const first = (await repository.listEnergyPlans())[0]
  expect(first).toMatchObject({ revision: 1, goalKcal: null, method: 'none', manualKcal: null, factor: null })
  await waitFor(() => { expect(screen.getByLabelText('Дата начала действия плана')).toHaveFocus() })
  change('Калорийная цель, ккал/сутки (необязательно)', '0')
  change('Способ оценки суточного расхода', 'manual')
  change('Общая ручная оценка расхода, ккал/сутки', '0')
  change('Источник оценки расхода (необязательно)', 'Синтетический источник')
  save()
  await waitFor(async () => { expect(await db.energyPlans.count()).toBe(2) })
  const list = screen.getByRole('list', { name: 'Версии энергетического плана' })
  expect(await within(list).findByText('Общая ручная оценка: 0 ккал/сутки.')).toBeVisible()
  expect(within(list).getByText('Цель: 0 ккал/сутки.')).toBeVisible()
  expect(within(list).getByText('Источник оценки: Синтетический источник')).toBeVisible()
  expect(await db.energyPlans.get(first?.id ?? '')).toEqual(first)
  expect(screen.getByLabelText('Калорийная цель, ккал/сутки (необязательно)')).toHaveValue('')
})

it('сохраняет снимок профиля и не округляет коэффициент до целого или сохраняет параметры другого метода', async () => {
  await db.profiles.add({ id: 'self', name: '', heightCm: 170, birthDate: '1996-10-14', formulaSex: 'male' })
  await db.weights.add({ id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', kg: 70 })
  open()
  change('Способ оценки суточного расхода', 'manual')
  change('Общая ручная оценка расхода, ккал/сутки', '2500')
  change('Способ оценки суточного расхода', 'factor')
  change('Ваш коэффициент активности', '1,4')
  change('Калорийная цель, ккал/сутки (необязательно)', '1800,5')
  save()
  expect(await screen.findByText('Коэффициент активности: 1,4. Расход в покое (оценка): 1 618 ккал/сутки.')).toBeVisible()
  const plans = await repository.listEnergyPlans()
  expect(plans[0]).toMatchObject({ goalKcal: 1800.5, manualKcal: null, factor: 1.4, snapshot: { kg: 70, heightCm: 170, age: 30, formulaSex: 'male' } })
})

it('показывает связанные ошибки, сохраняет ввод при отказе хранения и допускает повтор', async () => {
  open()
  await screen.findByText('План пока не задан.')
  change('Дата начала действия плана', '2026-10-13')
  save()
  expect(screen.getByLabelText('Дата начала действия плана')).toHaveFocus()
  expect(screen.getByLabelText('Дата начала действия плана')).toHaveAccessibleDescription('Новая версия действует с сегодняшнего или будущего дня')
  change('Дата начала действия плана', '2026-10-14')
  change('Калорийная цель, ккал/сутки (необязательно)', '-1')
  save()
  expect(screen.getByLabelText('Калорийная цель, ккал/сутки (необязательно)')).toHaveFocus()
  change('Калорийная цель, ккал/сутки (необязательно)', '1800')
  change('Способ оценки суточного расхода', 'factor')
  save()
  expect(screen.getByLabelText('Ваш коэффициент активности')).toHaveFocus()
  expect(await db.energyPlans.count()).toBe(0)
  change('Ваш коэффициент активности', '1,5')
  vi.spyOn(repository, 'addEnergyPlan').mockRejectedValueOnce(Object.assign(new Error('synthetic-private-details'), { name: 'QuotaExceededError' }))
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByLabelText('Ваш коэффициент активности')).toHaveValue('1,5')
  save()
  expect(await screen.findByText('Новая версия плана сохранена')).toBeVisible()
  expect(await db.energyPlans.count()).toBe(1)
})

it('отображает дробные цель и ручную оценку без превращения в ноль', async () => {
  await repository.addEnergyPlan({ effectiveFrom: '2026-10-14', goalKcal: 0.25, method: 'manual', manualKcal: 0.25, factor: null, source: '' })
  open()
  expect(await screen.findByText('Общая ручная оценка: 0,25 ккал/сутки.')).toBeVisible()
  expect(screen.getByText('Цель: 0,25 ккал/сутки.')).toBeVisible()
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as workouts from '../data/workoutRepository'
import { DayProvider } from '../ui/DayContext'
import { WorkoutJournal } from './WorkoutJournal'

const input = { date: '2026-10-14', kind: 'Учебная прогулка', minutes: 20, kcal: null, source: '', note: '' }
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
  await db.workouts.clear()
})
afterEach(async () => { vi.restoreAllMocks(); await db.workouts.clear(); vi.useRealTimers() })

it('ожидающее добавление блокирует смену редактора, отказ сохраняет черновик и позволяет повтор', async () => {
  const original = await workouts.addWorkout(input)
  render(<DayProvider><WorkoutJournal /></DayProvider>)
  const edit = await screen.findByRole('button', { name: /^Изменить тренировку/ })
  const remove = screen.getByRole('button', { name: /^Удалить тренировку/ })
  const form = screen.getByRole('form', { name: 'Добавление тренировки' })
  fireEvent.change(within(form).getByLabelText('Вид тренировки'), { target: { value: 'Новый учебный черновик' } })
  fireEvent.change(within(form).getByLabelText('Длительность, мин'), { target: { value: '25,5' } })
  let fail: (reason: unknown) => void = () => { throw new Error('Нет ожидающего сохранения') }
  const add = vi.spyOn(workouts, 'addWorkout').mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  fireEvent.click(within(form).getByRole('button', { name: 'Добавить тренировку' }))
  await waitFor(() => { expect(add).toHaveBeenCalledTimes(1) })
  const disabled = edit.hasAttribute('disabled') && remove.hasAttribute('disabled')
  fail(new DOMException('synthetic-workout-failure', 'QuotaExceededError'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(disabled).toBe(true)
  expect(within(form).getByLabelText('Вид тренировки')).toHaveValue('Новый учебный черновик')
  expect(within(form).getByLabelText('Длительность, мин')).toHaveValue('25,5')
  expect(await db.workouts.toArray()).toEqual([original])
  await waitFor(() => { expect(within(form).getByRole('button', { name: 'Добавить тренировку' })).toBeEnabled() })
  fireEvent.click(within(form).getByRole('button', { name: 'Добавить тренировку' }))
  await screen.findByText('Тренировка добавлена')
  expect(await db.workouts.count()).toBe(2)
  expect((await db.workouts.toArray()).find(row => row.id !== original.id)).toMatchObject({ kind: 'Новый учебный черновик', minutes: 25.5 })
  expect(await db.workouts.get(original.id)).toEqual(original)
})

it('ожидающее удаление блокирует новую запись и сохраняет её черновик при отказе и повторе', async () => {
  const original = await workouts.addWorkout(input)
  render(<DayProvider><WorkoutJournal /></DayProvider>)
  fireEvent.click(await screen.findByRole('button', { name: /^Удалить тренировку/ }))
  const form = screen.getByRole('form', { name: 'Добавление тренировки' })
  fireEvent.change(within(form).getByLabelText('Вид тренировки'), { target: { value: 'Несохранённая учебная тренировка' } })
  let fail: (reason: unknown) => void = () => { throw new Error('Нет ожидающего удаления') }
  const remove = vi.spyOn(workouts, 'deleteWorkout').mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject }))
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  await waitFor(() => { expect(remove).toHaveBeenCalledTimes(1) })
  const disabled = within(form).getByRole('button', { name: 'Добавить тренировку' }).hasAttribute('disabled')
  fail(new DOMException('synthetic-workout-delete-failure', 'QuotaExceededError'))
  await screen.findByRole('alert')
  expect(disabled).toBe(true)
  expect(within(form).getByLabelText('Вид тренировки')).toHaveValue('Несохранённая учебная тренировка')
  expect(await db.workouts.get(original.id)).toEqual(original)
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  await screen.findByText('Тренировка удалена')
  expect(await db.workouts.count()).toBe(0)
  expect(within(form).getByLabelText('Вид тренировки')).toHaveValue('Несохранённая учебная тренировка')
})

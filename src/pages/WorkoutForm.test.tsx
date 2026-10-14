import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkoutJournal } from './WorkoutJournal'
import { DayProvider } from '../ui/DayContext'
import { db } from '../data/db'
import * as repository from '../data/workoutRepository'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await db.workouts.clear()
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.workouts.clear()
  vi.useRealTimers()
})
function open() { render(<DayProvider><WorkoutJournal /></DayProvider>) }
function fill(kind = 'Синтетическая прогулка', minutes = '30,5', kcal = '') {
  fireEvent.change(screen.getByLabelText('Вид тренировки'), { target: { value: kind } })
  fireEvent.change(screen.getByLabelText('Длительность, мин'), { target: { value: minutes } })
  fireEvent.change(screen.getByLabelText('Ручная оценка расхода, ккал (необязательно)'), { target: { value: kcal } })
}
function save() { fireEvent.click(screen.getByRole('button', { name: 'Добавить тренировку' })) }

it('добавляет несколько тренировок, сохраняет неизвестную и нулевую оценку, выводит источник и очищает форму', async () => {
  open()
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем тренировки')
  expect(await screen.findByText('За этот день нет записей тренировок.')).toBeVisible()
  fill()
  save()
  expect(await screen.findByText('Расход: нет данных', { exact: false })).toBeVisible()
  await waitFor(() => { expect(screen.getByLabelText('Вид тренировки')).toHaveValue('') })
  await waitFor(() => { expect(screen.getByLabelText('Вид тренировки')).toHaveFocus() })
  fill('Синтетическое занятие', '10', '0')
  fireEvent.change(screen.getByLabelText('Источник оценки (необязательно)'), { target: { value: 'Синтетический источник' } })
  fireEvent.change(screen.getByLabelText('Комментарий к тренировке (необязательно)'), { target: { value: 'Синтетическая заметка' } })
  save()
  const list = await screen.findByRole('list', { name: 'Тренировки выбранного дня' })
  expect(await within(list).findByText(/Ручная оценка: 0 ккал/)).toBeVisible()
  expect(within(list).getByText('Источник: Синтетический источник')).toBeVisible()
  expect(within(list).getByText('Синтетическая заметка')).toBeVisible()
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  expect((await db.workouts.toArray()).map(value => value.kcal).sort()).toEqual([0, null])
})

it('связывает ошибки с видом, длительностью и оценкой, не добавляя тренировку', async () => {
  open()
  await screen.findByText('За этот день нет записей тренировок.')
  save()
  expect(screen.getByLabelText('Вид тренировки')).toHaveFocus()
  expect(screen.getByLabelText('Вид тренировки')).toHaveAttribute('aria-invalid', 'true')
  fill('Синтетический вид', '0')
  save()
  expect(screen.getByLabelText('Длительность, мин')).toHaveAccessibleDescription('Длительность должна быть больше нуля')
  expect(screen.getByLabelText('Длительность, мин')).toHaveFocus()
  fill('Синтетический вид', '30', '-1')
  save()
  expect(screen.getByLabelText('Ручная оценка расхода, ккал (необязательно)')).toHaveFocus()
  expect(await db.workouts.count()).toBe(0)
})

it('оставляет ввод при ошибке хранения и допускает повторную попытку', async () => {
  open()
  await screen.findByText('За этот день нет записей тренировок.')
  vi.spyOn(repository, 'addWorkout').mockRejectedValueOnce(Object.assign(new Error('synthetic-private-details'), { name: 'QuotaExceededError' }))
  fill()
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByLabelText('Вид тренировки')).toHaveValue('Синтетическая прогулка')
  save()
  expect(await screen.findByText('Расход: нет данных', { exact: false })).toBeVisible()
})

it('отменяет правку, отклоняет будущую дату и переносит запись с прежним ID', async () => {
  const entry = await repository.addWorkout({ date: '2026-10-14', kind: 'Синтетический вид', minutes: 30, kcal: 0, source: '', note: '' })
  open()
  fireEvent.click(await screen.findByRole('button', { name: /Изменить тренировку 1/ }))
  expect(screen.getByLabelText('Дата тренировки')).toHaveFocus()
  expect(screen.getByLabelText('Ручная оценка расхода, ккал (необязательно)')).toHaveValue('0')
  fireEvent.change(screen.getByLabelText('Вид тренировки'), { target: { value: 'Несохранённая правка' } })
  fireEvent.click(screen.getByRole('button', { name: 'Отменить правку тренировки' }))
  expect(await db.workouts.get(entry.id)).toEqual(entry)
  await waitFor(() => { expect(screen.getByLabelText('Вид тренировки')).toHaveFocus() })
  fireEvent.click(screen.getByRole('button', { name: /Изменить тренировку 1/ }))
  fireEvent.change(screen.getByLabelText('Дата тренировки'), { target: { value: '2026-10-15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить тренировку' }))
  expect(screen.getByLabelText('Дата тренировки')).toHaveAccessibleDescription('Дата тренировки не может быть в будущем')
  expect(screen.getByLabelText('Дата тренировки')).toHaveFocus()
  expect(await db.workouts.get(entry.id)).toEqual(entry)
  fireEvent.change(screen.getByLabelText('Дата тренировки'), { target: { value: '2026-10-13' } })
  fill('Изменённый синтетический вид', '15,5', '')
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить тренировку' }))
  expect(await screen.findByText('Тренировка обновлена')).toBeVisible()
  expect(await screen.findByText('За этот день нет записей тренировок.')).toBeVisible()
  expect(await db.workouts.get(entry.id)).toEqual({ ...entry, date: '2026-10-13', kind: 'Изменённый синтетический вид', minutes: 15.5, kcal: null })
  await waitFor(() => { expect(screen.getByLabelText('Вид тренировки')).toHaveFocus() })
})

it('сохраняет запись при отмене и ошибке удаления и позволяет подтвердить повторно', async () => {
  const entry = await repository.addWorkout({ date: '2026-10-14', kind: 'Синтетический вид', minutes: 30, kcal: null, source: '', note: '' })
  open()
  fireEvent.click(await screen.findByRole('button', { name: /Удалить тренировку 1/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(await db.workouts.get(entry.id)).toEqual(entry)
  fireEvent.click(screen.getByRole('button', { name: /Удалить тренировку 1/ }))
  expect(screen.getByRole('button', { name: /Изменить тренировку 1/ })).toBeDisabled()
  vi.spyOn(repository, 'deleteWorkout').mockRejectedValueOnce(Object.assign(new Error('synthetic-private-details'), { name: 'QuotaExceededError' }))
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('alertdialog')).toBeVisible()
  expect(await db.workouts.get(entry.id)).toEqual(entry)
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  expect(await screen.findByText('Тренировка удалена')).toBeVisible()
  expect(await screen.findByText('За этот день нет записей тренировок.')).toBeVisible()
  expect(await db.workouts.count()).toBe(0)
  await waitFor(() => { expect(screen.getByLabelText('Вид тренировки')).toHaveFocus() })
})

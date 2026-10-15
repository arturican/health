import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActivityPage } from './ActivityPage'
import { DayProvider } from '../ui/DayContext'
import { db } from '../data/db'
import * as repository from '../data/stepsRepository'
import * as access from '../dataAccess'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await db.steps.clear()
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.steps.clear()
  vi.useRealTimers()
})
function open() { render(<DayProvider><ActivityPage /></DayProvider>) }

it('не подменяет исходный итог черновика и позволяет явно загрузить новое значение', async () => {
  const original = { date: '2026-10-14', count: 100 }
  await repository.saveSteps(original)
  const save = vi.spyOn(access, 'saveSteps').mockRejectedValueOnce(new Error('Данные изменились'))
  open()
  const input = await screen.findByLabelText('Шаги за день')
  fireEvent.change(input, { target: { value: '200' } })
  await act(async () => { await repository.saveSteps({ ...original, count: 300 }) })
  await screen.findByText('Шаги за этот день: 300')
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Данные изменились')
  expect(save).toHaveBeenCalledWith({ ...original, count: 200 }, original)
  expect(input).toHaveValue('200')
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить сохранённый итог' }))
  expect(input).toHaveValue('300')
  fireEvent.change(input, { target: { value: '400' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  await screen.findByText('Шаги за этот день: 400')
  expect(save).toHaveBeenLastCalledWith({ ...original, count: 400 }, { ...original, count: 300 })
})

it('подтверждение удаления сохраняет исходный итог при фоновом изменении', async () => {
  const original = { date: '2026-10-14', count: 100 }
  await repository.saveSteps(original)
  const remove = vi.spyOn(access, 'deleteSteps').mockRejectedValue(new Error('Данные изменились'))
  open()
  fireEvent.click(await screen.findByRole('button', { name: 'Удалить итог шагов' }))
  await act(async () => { await repository.saveSteps({ ...original, count: 300 }) })
  await screen.findByText('Шаги за этот день: 300')
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Данные изменились')
  expect(remove).toHaveBeenCalledWith(original)
})

it('показывает отсутствие, записывает ноль, обновляет итог и удаляет только после подтверждения', async () => {
  open()
  expect(screen.getByText('Загружаем шаги…')).toHaveAttribute('role', 'status')
  expect(await screen.findByText('Шаги за этот день: нет данных')).toBeVisible()
  const input = screen.getByLabelText('Шаги за день')
  fireEvent.change(input, { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  expect(await screen.findByText('Шаги за этот день: 0')).toBeVisible()
  fireEvent.change(input, { target: { value: '1200' } })
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Сохранить шаги' })).toBeEnabled() })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  expect(await screen.findByText('Шаги за этот день: 1 200', { exact: false })).toBeVisible()
  expect(await db.steps.toArray()).toEqual([{ date: '2026-10-14', count: 1200 }])
  fireEvent.click(screen.getByRole('button', { name: 'Удалить итог шагов' }))
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(await db.steps.count()).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: 'Удалить итог шагов' }))
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  expect(await screen.findByText('Итог шагов удалён')).toBeVisible()
  expect(await screen.findByText('Шаги за этот день: нет данных')).toBeVisible()
  expect(input).toHaveValue('')
  await waitFor(() => { expect(input).toHaveFocus() })
})

it('связывает неверный ввод с полем и сохраняет данные при ошибке хранения для повторной попытки', async () => {
  await repository.saveSteps({ date: '2026-10-14', count: 0 })
  open()
  const input = await screen.findByLabelText('Шаги за день')
  for (const value of ['', '-1', '0.5', '1000001']) {
    fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveFocus()
    expect(input).toHaveAccessibleDescription()
    expect(await repository.getSteps()).toEqual({ date: '2026-10-14', count: 0 })
  }
  vi.spyOn(repository, 'saveSteps').mockRejectedValueOnce(Object.assign(new Error('synthetic-private-details'), { name: 'QuotaExceededError' }))
  fireEvent.change(input, { target: { value: '100' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(input).toHaveValue('100')
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить шаги' }))
  expect(await screen.findByText('Шаги за этот день: 100')).toBeVisible()
})

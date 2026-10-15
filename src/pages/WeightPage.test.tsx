import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as repository from '../data/weightRepository'
import { WeightPage } from './WeightPage'

const first = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-12', kg: 70 }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await Promise.all([db.weights.clear(), db.profiles.clear()])
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all([db.weights.clear(), db.profiles.clear()])
  vi.useRealTimers()
})

async function openJournal(withWeight = false) {
  await db.profiles.put({ id: 'self', name: '', heightCm: 170, birthDate: '2000-01-01', formulaSex: 'none' })
  if (withWeight) await db.weights.put(first)
  const view = render(<WeightPage />)
  await screen.findByRole('form', { name: 'Новое измерение' })
  return view
}

function save(value: string, date = '2026-10-14') {
  fireEvent.change(screen.getByLabelText('Дата измерения'), { target: { value: date } })
  fireEvent.change(screen.getByLabelText('Вес, кг'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить вес' }))
}

it('предлагает создать профиль и не показывает выдуманное измерение', async () => {
  render(<WeightPage />)
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем историю')
  expect(await screen.findByRole('link', { name: 'создайте профиль' })).toHaveAttribute('href', '#profile')
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
})

it('добавляет вес с запятой, обновляет ту же дату и сохраняет после повторного открытия', async () => {
  const view = await openJournal()
  expect(screen.getByText(/Измерений пока нет/)).toBeVisible()
  save('70,5')
  expect(await screen.findByText('70,5 кг')).toBeVisible()
  expect(await screen.findByText('Измерение сохранено', { exact: true })).toHaveAttribute('role', 'status')
  await waitFor(() => { expect(screen.getByLabelText('Вес, кг')).toHaveValue('') })
  save('71')
  expect(await screen.findByText('71 кг')).toBeVisible()
  expect(await db.weights.count()).toBe(1)
  view.unmount()
  render(<WeightPage />)
  expect(await screen.findByText('71 кг')).toBeVisible()
})

it('редактирует запись с защитой занятой даты и отменяет несохранённые изменения', async () => {
  await openJournal(true)
  await db.weights.put({ ...first, id: '00000000-0000-4000-8000-000000000002', date: '2026-10-13', kg: 72 })
  fireEvent.click(screen.getByRole('button', { name: 'Изменить вес за 12.10.2026' }))
  expect(screen.getByLabelText('Дата измерения')).toHaveValue(first.date)
  expect(screen.getByLabelText('Вес, кг')).toHaveValue('70')
  save('73', '2026-10-13')
  expect(await screen.findByRole('alert')).toHaveTextContent('На эту дату уже есть измерение')
  expect(await db.weights.get(first.id)).toEqual(first)
  save('73,25', '2026-10-11')
  expect(await screen.findByText('73,25 кг')).toBeVisible()
  expect(await db.weights.get(first.id)).toEqual({ ...first, date: '2026-10-11', kg: 73.25 })
  fireEvent.click(screen.getByRole('button', { name: 'Изменить вес за 11.10.2026' }))
  fireEvent.change(screen.getByLabelText('Вес, кг'), { target: { value: '99' } })
  fireEvent.click(screen.getByRole('button', { name: 'Отменить изменение' }))
  expect(screen.getByRole('form', { name: 'Новое измерение' })).toBeVisible()
  expect(screen.getByLabelText('Вес, кг')).toHaveValue('')
  expect(await db.weights.get(first.id)).toMatchObject({ kg: 73.25 })
})

it.each([
  { value: '0', date: '2026-10-14', field: 'Вес, кг', error: /больше нуля/ },
  { value: '70', date: '2026-10-15', field: 'Дата измерения', error: /в будущем/ },
  { value: '70', date: '1999-12-31', field: 'Дата измерения', error: /раньше даты рождения/ },
  { value: '70', date: '', field: 'Дата измерения', error: /Введите дату/ },
])('связывает неверный ввод с полем и не записывает вес: $date/$value', async ({ value, date, field, error }) => {
  await openJournal()
  save(value, date)
  expect(screen.getByRole('alert')).toHaveTextContent('Проверьте отмеченные поля')
  expect(screen.getByLabelText(field)).toHaveAccessibleDescription(error)
  expect(screen.getByLabelText(field)).toHaveFocus()
  expect(await db.weights.count()).toBe(0)
})

it('удаляет только после подтверждения и возвращает фокус после отмены', async () => {
  await openJournal(true)
  const button = screen.getByRole('button', { name: 'Удалить вес за 12.10.2026' })
  button.focus()
  fireEvent.click(button)
  expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Удалить измерение за 12.10.2026?')
  expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(button).toHaveFocus()
  expect(await db.weights.count()).toBe(1)
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  expect(await screen.findByText('Измерение удалено', { exact: true })).toHaveAttribute('role', 'status')
  expect(await screen.findByText(/Измерений пока нет/)).toBeVisible()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(await db.weights.count()).toBe(0)
})

it('сообщает об ошибке хранилища и позволяет повторить сохранение', async () => {
  await openJournal()
  vi.spyOn(repository, 'saveWeight').mockRejectedValueOnce(Object.assign(new Error('synthetic storage details'), { name: 'QuotaExceededError' }))
  save('70')
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('button', { name: 'Сохранить вес' })).toBeEnabled()
  expect(screen.getByLabelText('Вес, кг')).toHaveValue('70')
  expect(await db.weights.count()).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить вес' }))
  expect(await screen.findByText('70 кг')).toBeVisible()
})

it('сохраняет точный вес в доступных данных графика вместо округлённого нуля', async () => {
  await openJournal()
  save('0,0001')
  expect(await within(await screen.findByRole('list', { name: 'История веса' })).findByText('0,0001 кг')).toBeVisible()
  expect(screen.getByRole('img', { name: 'График веса' })).toHaveAccessibleDescription(/диапазон 0,0001–0,0001 кг/)
})

it('сохраняет малое измерение без изменений после повторного открытия редактора', async () => {
  await openJournal()
  save('0,0000001')
  await screen.findByRole('button', { name: 'Изменить вес за 14.10.2026' })
  const saved = await db.weights.where('date').equals('2026-10-14').first()
  fireEvent.click(screen.getByRole('button', { name: 'Изменить вес за 14.10.2026' }))
  expect(screen.getByLabelText('Вес, кг')).toHaveValue('0.0000001')
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить вес' }))
  await screen.findByRole('form', { name: 'Новое измерение' })
  expect(await db.weights.where('date').equals('2026-10-14').first()).toEqual(saved)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

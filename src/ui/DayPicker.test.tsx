import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DayProvider, useDay } from './DayContext'
import { DayPicker } from './DayPicker'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
})
afterEach(() => { vi.useRealTimers() })

it('применяет дату явным действием и возвращает сегодня', () => {
  render(<DayProvider><DayPicker /></DayProvider>)
  expect(screen.getByText('Открыт день: 14.10.2026')).toBeVisible()
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value: '2026-10-13' } })
  expect(screen.getByText('Открыт день: 14.10.2026')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  expect(screen.getByText('Открыт день: 13.10.2026')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Сегодня' }))
  expect(screen.getByText('Открыт день: 14.10.2026')).toBeVisible()
  expect(screen.getByLabelText('День дневника')).toHaveValue('2026-10-14')
})

it.each(['2026-10-15', ''])('не применяет некорректную дату %s и фокусирует ошибку', value => {
  render(<DayProvider><DayPicker /></DayProvider>)
  fireEvent.change(screen.getByLabelText('День дневника'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Открыть день' }))
  expect(screen.getByLabelText('День дневника')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('День дневника')).toHaveFocus()
  expect(screen.getByText('Открыт день: 14.10.2026')).toBeVisible()
})

it('сообщает об отсутствующем контексте приложения', () => {
  expect(() => renderHook(useDay)).toThrow('Для выбора дня нужен DayProvider')
})

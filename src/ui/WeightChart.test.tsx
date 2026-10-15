import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { WeightChart } from './WeightChart'

const first = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-01', kg: 70 }
const second = { id: '00000000-0000-4000-8000-000000000002', date: '2026-10-03', kg: 69.25 }

it('показывает честное пустое состояние, не строя график нулевого веса', () => {
  render(<WeightChart weights={[]} />)
  expect(screen.getByRole('heading', { name: 'График веса' })).toBeVisible()
  expect(screen.getByText('Для графика нужны измерения веса.')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('объясняет доступную одиночную точку и использованный диапазон шкалы', () => {
  render(<WeightChart weights={[first]} />)
  const graph = screen.getByRole('img', { name: 'График веса' })
  expect(graph).toHaveAccessibleDescription('Измерения от 01.10.2026 до 01.10.2026; диапазон 70–70 кг. Все числа доступны в истории измерений ниже.')
  expect(screen.getByText(/Диапазон шкалы: 70–70 кг/)).toHaveTextContent('может не начинаться с нуля')
  expect(screen.getByText(/измерений в пропущенные дни нет/)).toBeVisible()
})

it('обновляет период и диапазон после изменения истории и удаляет старый график при очистке', () => {
  const view = render(<WeightChart weights={[second, first]} />)
  expect(screen.getByRole('img', { name: 'График веса' })).toHaveAccessibleDescription(/от 01.10.2026 до 03.10.2026; диапазон 69,25–70 кг/)
  view.rerender(<WeightChart weights={[{ ...second, kg: 0.0001 }]} />)
  expect(screen.getByRole('img', { name: 'График веса' })).toHaveAccessibleDescription(/диапазон 0,0001–0,0001 кг/)
  expect(screen.getByText('Период: 03.10.2026 — 03.10.2026.')).toBeVisible()
  view.rerender(<WeightChart weights={[]} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByText(/Период:/)).not.toBeInTheDocument()
})


it('выбирает настоящие измерения списком и клавиатурой, сохраняя точное значение и границы', () => {
  render(<WeightChart weights={[second, first]} />)
  const output = within(screen.getByRole('status', { name: 'Выбранное измерение' }))
  const chart = screen.getByRole('button', { name: 'Выбрать измерение на графике' })
  expect(output.getByText('03.10.2026')).toBeVisible()
  fireEvent.keyDown(chart, { key: 'Home' })
  expect(output.getByText('01.10.2026')).toBeVisible()
  fireEvent.keyDown(chart, { key: 'ArrowLeft' })
  expect(output.getByText('01.10.2026')).toBeVisible()
  fireEvent.keyDown(chart, { key: 'ArrowRight' })
  expect(output.getByText('03.10.2026')).toBeVisible()
  expect(output.getByText('69,25')).toBeVisible()
  fireEvent.keyDown(chart, { key: 'ArrowRight' })
  fireEvent.keyDown(chart, { key: 'Tab' })
  fireEvent.click(chart, { detail: 0 })
  expect(output.getByText('03.10.2026')).toBeVisible()
  fireEvent.keyDown(chart, { key: 'Home' })
  fireEvent.keyDown(chart, { key: 'End' })
  expect(output.getByText('03.10.2026')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Измерение на графике', { exact: true }), { target: { value: first.id } })
  expect(output.getByText('01.10.2026')).toBeVisible()
})

it('показывает исправленное выбранное измерение и убирает устаревшее после удаления или очистки', () => {
  const view = render(<WeightChart weights={[first, second]} />)
  fireEvent.change(screen.getByLabelText('Измерение на графике', { exact: true }), { target: { value: first.id } })
  view.rerender(<WeightChart weights={[{ ...first, kg: 70.1234567890123, date: '2026-10-02' }, second]} />)
  const output = screen.getByRole('status', { name: 'Выбранное измерение' })
  expect(within(output).getByText('70,1234567890123')).toBeVisible()
  expect(within(output).getByText('02.10.2026')).toBeVisible()
  view.rerender(<WeightChart weights={[second]} />)
  expect(within(output).getByText('03.10.2026')).toBeVisible()
  expect(within(output).queryByText('70,1234567890123')).not.toBeInTheDocument()
  view.rerender(<WeightChart weights={[]} />)
  expect(screen.queryByRole('status', { name: 'Выбранное измерение' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Выбрать измерение на графике' })).not.toBeInTheDocument()
})


it('сохраняет одинаковые значения двух дат без ложного диапазона и поддерживает одиночное измерение', () => {
  const view = render(<WeightChart weights={[first, { ...second, kg: 70 }]} />)
  const chart = screen.getByRole('button', { name: 'Выбрать измерение на графике' })
  fireEvent.keyDown(chart, { key: 'Home' })
  expect(within(screen.getByRole('status', { name: 'Выбранное измерение' })).getByText('01.10.2026')).toBeVisible()
  fireEvent.keyDown(chart, { key: 'End' })
  expect(within(screen.getByRole('status', { name: 'Выбранное измерение' })).getByText('03.10.2026')).toBeVisible()
  expect(screen.getByRole('img', { name: 'График веса' })).toHaveAccessibleDescription(/диапазон 70–70 кг/)
  view.rerender(<WeightChart weights={[first]} />)
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) fireEvent.keyDown(chart, { key })
  expect(within(screen.getByRole('status', { name: 'Выбранное измерение' })).getByText('01.10.2026')).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Измерение на графике' })).toHaveValue(first.id)
})

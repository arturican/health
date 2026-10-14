import { render, screen } from '@testing-library/react'
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

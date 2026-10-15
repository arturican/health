import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { LabTrends } from './LabTrends'

const source = { id: '00000000-0000-4000-8000-000000000001', fileId: '00000000-0000-4000-8000-000000000002', date: '2026-10-14', title: 'Учебный бланк', kind: 'lab' as const, note: '' }
const first = { id: '00000000-0000-4000-8000-000000000003', documentId: source.id, date: '2026-10-01', name: 'Учебный показатель', unit: 'усл. ед.', value: { type: 'number' as const, operator: 'eq' as const, number: 12 }, reference: '', note: '' }
const second = { ...first, id: '00000000-0000-4000-8000-000000000004', date: '2026-10-14', value: { ...first.value, number: 10 } }
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  await Promise.all([db.documents.clear(), db.labResults.clear(), db.files.clear()])
})
afterEach(async () => {
  cleanup(); await Promise.all([db.documents.clear(), db.labResults.clear(), db.files.clear()]); vi.useRealTimers()
})

it('объясняет пустоту без фиктивных значений и графика', async () => {
  render(<LabTrends />)
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем историю')
  expect(await screen.findByText(/Показателей для графика пока нет/)).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('показывает точные значения, выбор даты и обновления после правки и удаления', async () => {
  await db.documents.add(source); await db.labResults.bulkAdd([first, second])
  render(<LabTrends />)
  expect(await screen.findByRole('img', { name: 'График выбранного показателя' })).toBeVisible()
  const output = screen.getByRole('status', { name: 'Выбранный показатель' })
  expect(within(output).getByText('10')).toBeVisible()
  expect(within(screen.getByRole('list', { name: 'История выбранного показателя' })).getAllByRole('listitem')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Измерение показателя'), { target: { value: first.id } })
  expect(within(output).getByText('12')).toBeVisible()
  await db.labResults.update(first.id, { value: { ...first.value, number: 9.51234567890123 } })
  expect(await within(output).findByText('9,51234567890123')).toBeVisible()
  await db.labResults.delete(first.id)
  await waitFor(() => expect(within(output).getByText('10')).toBeVisible())
  expect(screen.queryByText('9,51234567890123')).not.toBeInTheDocument()
  await db.labResults.clear()
  expect(await screen.findByText(/Показателей для графика пока нет/)).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

it('разделяет единицы, оставляет текст и границы в истории без точек', async () => {
  await db.documents.add(source)
  await db.labResults.bulkAdd([first, { ...second, unit: '', value: { type: 'text', text: 'Учебный текст' } }, { ...second, id: '00000000-0000-4000-8000-000000000005', unit: 'другие ед.', value: { type: 'number', operator: 'lt', number: 3 } }])
  render(<LabTrends />)
  const select = await screen.findByLabelText('Показатель для графика')
  expect(within(select).getAllByRole('option')).toHaveLength(3)
  for (const unit of ['', 'другие ед.']) {
    fireEvent.change(select, { target: { value: JSON.stringify([first.name, unit]) } })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText(/Для графика нужны точные числа/)).toBeVisible()
  }
  expect(within(screen.getByRole('status', { name: 'Выбранный показатель' })).getByText('< 3')).toBeVisible()
  fireEvent.change(select, { target: { value: JSON.stringify([first.name, first.unit]) } })
  expect(screen.getByRole('img')).toBeVisible()
})

it('сообщает об отсутствующем файле без потери показателей', async () => {
  await db.documents.add(source); await db.labResults.add(first)
  render(<LabTrends />)
  fireEvent.click(await screen.findByRole('button', { name: 'Скачать бланк выбранного показателя' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть бланк показателя')
  expect(await db.labResults.get(first.id)).toEqual(first)
})

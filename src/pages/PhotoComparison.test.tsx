import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PhotoComparison } from './PhotoComparison'
import { db } from '../data/db'
import type { Photo } from '../domain/photo'

vi.mock('../ui/FileImage', () => ({ FileImage: ({ alt, width, height }: { alt: string; width?: number; height?: number }) => <img alt={alt} width={width} height={height} src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKz8AAAAASUVORK5CYII=" /> }))

const first: Photo = { id: '00000000-0000-4000-8000-000000000001', fileId: '00000000-0000-4000-8000-000000000101', date: '2026-10-14', title: 'Первый синтетический снимок', note: '', width: 320, height: 240 }
const second: Photo = { ...first, id: '00000000-0000-4000-8000-000000000002', fileId: '00000000-0000-4000-8000-000000000102', date: '2026-10-13', title: 'Второй синтетический снимок', width: 240, height: 320 }
const third: Photo = { ...first, id: '00000000-0000-4000-8000-000000000003', fileId: '00000000-0000-4000-8000-000000000103', date: '2026-10-12', title: 'Третий синтетический снимок' }
function choose(label: 'Первое фото' | 'Второе фото', photo: Photo) { fireEvent.change(screen.getByLabelText(label), { target: { value: photo.id } }) }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await db.open()
  await db.photos.clear()
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.photos.clear()
  vi.useRealTimers()
})

it('объясняет пустую/единственную запись и обновляет независимо подписанные варианты при добавлении фото', async () => {
  render(<PhotoComparison />)
  expect(screen.getByRole('heading', { level: 2, name: 'Сравнение фото' })).toBeVisible()
  expect(await screen.findByText('Для сравнения добавьте минимум две фотографии.')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  await db.photos.add(first)
  const firstChoice = await screen.findByLabelText('Первое фото')
  await waitFor(() => { expect(within(firstChoice).getByRole('option', { name: `${first.date} — ${first.title}` })).toBeInTheDocument() })
  const secondChoice = screen.getByLabelText('Второе фото')
  expect(firstChoice).toHaveValue('')
  expect(secondChoice).toHaveValue('')
  expect(within(firstChoice).getByRole('option', { name: 'Выберите фото' })).toHaveValue('')
  expect(screen.getByText('Для сравнения добавьте минимум две фотографии.')).toBeVisible()
  await db.photos.add(second)
  await waitFor(() => { expect(within(secondChoice).getByRole('option', { name: `${second.date} — ${second.title}` })).toBeInTheDocument() })
  expect(firstChoice).toHaveValue('')
  expect(secondChoice).toHaveValue('')
  expect(screen.queryByText('Для сравнения добавьте минимум две фотографии.')).not.toBeInTheDocument()
})

it('сортирует варианты по датам и меняет первое изображение без изменения второго выбора', async () => {
  await db.photos.bulkAdd([third, first, second])
  render(<PhotoComparison />)
  const select = await screen.findByLabelText('Первое фото')
  await waitFor(() => { expect(within(select).getAllByRole('option')).toHaveLength(4) })
  expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual(['Выберите фото', `${first.date} — ${first.title}`, `${second.date} — ${second.title}`, `${third.date} — ${third.title}`])
  choose('Первое фото', first)
  choose('Второе фото', second)
  const left = screen.getByRole('figure', { name: 'Первое выбранное фото' })
  const right = screen.getByRole('figure', { name: 'Второе выбранное фото' })
  expect(within(left).getByRole('img', { name: `Первое фото: ${first.title}` })).toHaveAttribute('width', '320')
  expect(within(right).getByRole('img', { name: `Второе фото: ${second.title}` })).toHaveAttribute('height', '320')
  expect(left).toHaveTextContent(first.date)
  expect(right).toHaveTextContent(second.date)
  choose('Первое фото', third)
  expect(within(left).queryByRole('img', { name: `Первое фото: ${first.title}` })).not.toBeInTheDocument()
  expect(within(left).getByRole('img', { name: `Первое фото: ${third.title}` })).toBeVisible()
  expect(screen.getByLabelText('Второе фото')).toHaveValue(second.id)
  expect(within(right).getByRole('img', { name: `Второе фото: ${second.title}` })).toBeVisible()
})

it('объясняет одинаковый ID и убирает ошибку после выбора разных снимков', async () => {
  await db.photos.bulkAdd([first, second])
  render(<PhotoComparison />)
  const firstChoice = await screen.findByLabelText('Первое фото')
  await within(firstChoice).findByRole('option', { name: `${first.date} — ${first.title}` })
  choose('Первое фото', first)
  choose('Второе фото', first)
  expect(screen.getByRole('alert')).toHaveTextContent('Выберите два разных фото для сравнения.')
  expect(screen.getByLabelText('Первое фото')).toHaveValue(first.id)
  expect(screen.getByLabelText('Второе фото')).toHaveValue(first.id)
  choose('Второе фото', second)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: `Первое фото: ${first.title}` })).toBeVisible()
  expect(screen.getByRole('img', { name: `Второе фото: ${second.title}` })).toBeVisible()
})

it('удаление выбранной записи убирает старое изображение и позволяет заменить только исчезнувший выбор', async () => {
  await db.photos.bulkAdd([first, second, third])
  render(<PhotoComparison />)
  await waitFor(() => { expect(within(screen.getByLabelText('Первое фото')).getAllByRole('option')).toHaveLength(4) })
  choose('Первое фото', first)
  choose('Второе фото', second)
  await db.photos.delete(first.id)
  const left = screen.getByRole('figure', { name: 'Первое выбранное фото' })
  await waitFor(() => { expect(within(left).queryByRole('img')).not.toBeInTheDocument() })
  expect(left).toHaveTextContent(/больше недоступно/)
  expect(screen.getByLabelText('Первое фото')).toHaveValue(first.id)
  expect(within(screen.getByLabelText('Первое фото')).getByRole('option', { name: 'Фото больше недоступно' })).toHaveValue(first.id)
  expect(screen.getByLabelText('Второе фото')).toHaveValue(second.id)
  expect(screen.getByRole('img', { name: `Второе фото: ${second.title}` })).toBeVisible()
  choose('Первое фото', third)
  expect(within(left).getByRole('img', { name: `Первое фото: ${third.title}` })).toBeVisible()
  expect(within(screen.getByLabelText('Первое фото')).queryByRole('option', { name: 'Фото больше недоступно' })).not.toBeInTheDocument()
  await db.photos.delete(second.id)
  expect(await screen.findByText('Для сравнения добавьте минимум две фотографии.')).toBeVisible()
  await waitFor(() => { expect(screen.queryByRole('img', { name: `Второе фото: ${second.title}` })).not.toBeInTheDocument() })
  expect(screen.getByRole('img', { name: `Первое фото: ${third.title}` })).toBeVisible()
})

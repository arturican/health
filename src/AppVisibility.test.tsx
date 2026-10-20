import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthBoundary } from './client/AuthBoundary'
import { App } from './App'
import { invalidateQueries } from './client/queries'
import { setClientSession } from './client/session'
import { clientDiary, clientSession, jsonResponse } from '../tests/clientSession'

vi.unmock('./dataAccess')

let failed = false
let paused: Promise<void> | undefined
let state = clientDiary
const network = vi.fn<typeof fetch>(async input => {
  if (typeof input !== 'string') throw new Error('Тест ожидает относительный URL')
  if (input === '/api/v1/diary-state') {
    const captured = state
    if (paused) await paused
    if (failed) throw new Error('Synthetic disconnected transport')
    return jsonResponse(captured)
  }
  if (/^\/api\/v1\/(photos|documents|lab-results)\?/.test(input)) return jsonResponse({ items: [], nextAfter: null })
  throw new Error('Неожиданный synthetic URL')
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  state = clientDiary
  failed = false
  paused = undefined
  network.mockClear()
  setClientSession(clientSession, clientDiary)
  vi.stubGlobal('fetch', network)
})
afterEach(() => {
  cleanup()
  setClientSession(null)
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

const media = [
  ['photos', 'Подпись фото', 'Файл фото'],
  ['documents', 'Название документа', 'Файл документа'],
] as const
it.each(media)('%s сохраняет черновик и файл при сбое и ожидающем повторе', async (route, title, fileLabel) => {
  window.history.replaceState(null, '', '/#' + route)
  render(<App />)
  const field = await screen.findByLabelText(title)
  const fileField = screen.getByLabelText<HTMLInputElement>(fileLabel)
  const file = new File(['synthetic bytes'], 'synthetic.png', { type: 'image/png' })
  fireEvent.change(field, { target: { value: 'Учебный несохранённый ввод' } })
  fireEvent.change(fileField, { target: { files: [file] } })
  failed = true
  act(() => { invalidateQueries() })
  await screen.findByText('Не удалось обновить видимость разделов. Ваш ввод сохранён.')
  expect(screen.getByLabelText(title)).toBe(field)
  expect(field).toHaveValue('Учебный несохранённый ввод')
  expect(fileField.files?.[0]).toBe(file)
  failed = false
  let release: () => void = () => { throw new Error('Нет ожидания') }
  paused = new Promise<void>(resolve => { release = resolve })
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку видимости' }))
  expect(screen.getByLabelText(title)).toBe(field)
  expect(fileField.files?.[0]).toBe(file)
  await act(async () => { release(); await paused })
  paused = undefined
  await waitFor(() => { expect(screen.queryByText('Обновляем настройки видимости…')).not.toBeInTheDocument() })
  expect(screen.getByLabelText(title)).toBe(field)
  expect(field).toHaveValue('Учебный несохранённый ввод')
  expect(fileField.files?.[0]).toBe(file)
  await waitFor(() => { expect(screen.getByRole('main')).toHaveFocus() })
})

it.each(media)('%s не открывает форму при первой ошибке неизвестной видимости', async (route, title) => {
  failed = true
  window.history.replaceState(null, '', '/#' + route)
  render(<App />)
  await screen.findByRole('heading', { name: 'Раздел скрыт' })
  expect(screen.queryByLabelText(title)).not.toBeInTheDocument()
})

it('смена epoch не переносит известную видимость и черновик прежнего входа', async () => {
  window.history.replaceState(null, '', '/#photos')
  render(<App />)
  fireEvent.change(await screen.findByLabelText('Подпись фото'), { target: { value: 'Прежний учебный ввод' } })
  failed = true
  act(() => { setClientSession({ ...clientSession, account: { ...clientSession.account, id: '10000000-0000-4000-8000-000000000002' } }, clientDiary) })
  await screen.findByRole('heading', { name: 'Раздел скрыт' })
  expect(screen.queryByLabelText('Подпись фото')).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('Прежний учебный ввод')).not.toBeInTheDocument()
})

it('fresh hide не отменяется поздним ответом прежнего чтения или следующим отказом', async () => {
  window.history.replaceState(null, '', '/#photos')
  render(<App />)
  await screen.findByLabelText('Подпись фото')
  let release: () => void = () => { throw new Error('Нет ожидания') }
  const waiting = new Promise<void>(resolve => { release = resolve })
  paused = waiting
  const before = network.mock.calls.length
  act(() => { invalidateQueries() })
  await waitFor(() => { expect(network.mock.calls.length).toBeGreaterThan(before) })
  paused = undefined
  state = { ...clientDiary, revision: 2, changeRevision: 1, value: { ...clientDiary.value, showPhotos: false } }
  act(() => { invalidateQueries() })
  await screen.findByRole('heading', { name: 'Раздел скрыт' })
  await act(async () => { release(); await waiting })
  failed = true
  act(() => { invalidateQueries() })
  await screen.findByText('Не удалось загрузить настройки видимости.')
  expect(screen.queryByLabelText('Подпись фото')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Раздел скрыт' })).toBeVisible()
})

it.each(media)('%s после нового generation перемонтирует форму и объясняет сброс ввода', async (route, title, fileLabel) => {
  window.history.replaceState(null, '', '/#' + route)
  render(<AuthBoundary><App /></AuthBoundary>)
  fireEvent.change(await screen.findByLabelText(title), { target: { value: 'Учебный прежний ввод' } })
  const fileField = screen.getByLabelText<HTMLInputElement>(fileLabel)
  fireEvent.change(fileField, { target: { files: [new File(['synthetic'], 'synthetic.png', { type: 'image/png' })] } })
  state = { ...clientDiary, generation: '30000000-0000-4000-8000-000000000001' }
  act(() => { invalidateQueries() })
  await screen.findByText('Дневник обновлён. Несохранённый ввод сброшен; проверьте записи перед повторным действием.')
  await waitFor(() => { expect(screen.getByLabelText(title)).toHaveValue('') })
  const freshFile = screen.getByLabelText<HTMLInputElement>(fileLabel)
  expect(freshFile).not.toBe(fileField)
  expect(freshFile.files).toHaveLength(0)
  const focused = document.activeElement
  expect(focused === screen.getByRole('main') || focused === screen.getByRole('complementary', { name: 'Обновление данных' })).toBe(true)
})

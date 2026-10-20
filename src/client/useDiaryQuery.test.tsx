import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDiaryQueryState } from './useDiaryQuery'
import { QueryFeedback } from './QueryFeedback'
import { getQueryErrorCount, getQueryRevision, invalidateQueries } from './queries'
import { setClientSession } from './session'
import { clientDiary, clientSession } from '../../tests/clientSession'
import { StorageBoundary } from '../ui/StorageBoundary'

const read = vi.fn<(day: string) => Promise<string[]>>()
function View({ day = 'one' }: { day?: string }) {
  const { data, current } = useDiaryQueryState(() => read(day), [day])
  if (data === undefined) return <p role="status">Загрузка</p>
  return <><p>{data.length ? data.join(', ') : 'Нет записей'}</p><input aria-label="Черновик" defaultValue="" /><button disabled={!current}>Изменить запись</button></>
}
function Harness({ day = 'one' }: { day?: string }) {
  return <><QueryFeedback /><StorageBoundary><View day={day} /></StorageBoundary></>
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Нет ожидания') }
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => { read.mockReset(); setClientSession(clientSession, clientDiary) })
afterEach(() => { cleanup(); setClientSession(null); expect(getQueryErrorCount()).toBe(0) })

it('показывает загрузку и пустой результат, не дублируя чтение в StrictMode', async () => {
  const pending = deferred<string[]>()
  read.mockReturnValue(pending.promise)
  render(<StrictMode><Harness /></StrictMode>)
  expect(screen.getByRole('status')).toHaveTextContent('Загрузка')
  await waitFor(() => { expect(read).toHaveBeenCalledOnce() })
  pending.resolve([])
  expect(await screen.findByText('Нет записей')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('отбрасывает запоздавший ответ предыдущего дня', async () => {
  const old = deferred<string[]>(), fresh = deferred<string[]>()
  read.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  const { rerender } = render(<Harness day="old" />)
  await waitFor(() => { expect(read).toHaveBeenCalledWith('old') })
  rerender(<Harness day="fresh" />)
  await waitFor(() => { expect(read).toHaveBeenCalledWith('fresh') })
  fresh.resolve(['Новые учебные записи'])
  await screen.findByText('Новые учебные записи')
  await act(async () => { old.resolve(['Прежние учебные записи']); await old.promise })
  expect(screen.queryByText('Прежние учебные записи')).not.toBeInTheDocument()
})

it('сохраняет форму при фоновом сбое и обновляет данные после повтора', async () => {
  read.mockResolvedValueOnce(['Первая учебная запись']).mockRejectedValueOnce(new Error('synthetic-private-error'))
    .mockResolvedValueOnce(['Обновлённая учебная запись'])
  render(<Harness />)
  await screen.findByText('Первая учебная запись')
  const field = screen.getByLabelText('Черновик')
  expect(screen.getByRole('button', { name: 'Изменить запись' })).toBeEnabled()
  fireEvent.change(field, { target: { value: 'Несохранённый учебный ввод' } })
  act(() => { invalidateQueries() })
  expect(screen.getByRole('button', { name: 'Изменить запись' })).toBeDisabled()
  expect(await screen.findByRole('alert')).toHaveTextContent('ваш ввод сохранён')
  expect(screen.getByLabelText('Черновик')).toBe(field)
  expect(field).toHaveValue('Несохранённый учебный ввод')
  expect(screen.getByRole('button', { name: 'Изменить запись' })).toBeDisabled()
  expect(screen.queryByText('synthetic-private-error')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
  expect(await screen.findByText('Обновлённая учебная запись')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Изменить запись' })).toBeEnabled()
  expect(field).toHaveValue('Несохранённый учебный ввод')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('начальная ошибка открывает безопасную границу и допускает повтор', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  read.mockRejectedValueOnce(new Error('synthetic-private-error')).mockResolvedValueOnce([])
  render(<Harness />)
  expect(await screen.findByRole('heading', { name: 'Раздел недоступен' })).toBeVisible()
  expect(screen.queryByText('synthetic-private-error')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку раздела' }))
  expect(await screen.findByText('Нет записей')).toBeVisible()
})

it('смена сессии немедленно скрывает прежний результат и черновик', async () => {
  const next = deferred<string[]>()
  read.mockResolvedValueOnce(['Учебные записи Alice']).mockReturnValueOnce(next.promise)
  render(<Harness />)
  await screen.findByText('Учебные записи Alice')
  fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'Прежний ввод' } })
  act(() => { setClientSession({ ...clientSession, account: { ...clientSession.account, login: 'bob' } }, clientDiary) })
  expect(screen.queryByText('Учебные записи Alice')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Черновик')).not.toBeInTheDocument()
  next.resolve(['Учебные записи Bob'])
  expect(await screen.findByText('Учебные записи Bob')).toBeVisible()
  expect(screen.getByLabelText('Черновик')).toHaveValue('')
})

it('обновляет при возврате фокуса и сети, снимает обработчики после закрытия', async () => {
  read.mockResolvedValue([])
  const { unmount } = render(<Harness />)
  await screen.findByText('Нет записей')
  fireEvent(window, new Event('focus'))
  await waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
  fireEvent(window, new Event('online'))
  await waitFor(() => { expect(read).toHaveBeenCalledTimes(3) })
  unmount()
  const revision = getQueryRevision()
  fireEvent(window, new Event('focus'))
  fireEvent(window, new Event('online'))
  expect(getQueryRevision()).toBe(revision)
})

import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthBoundary, SessionControls } from './AuthBoundary'
import { getClientSession, setClientSession } from './session'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'

const network = vi.fn<typeof fetch>()
beforeEach(() => { setClientSession(null); network.mockReset(); vi.stubGlobal('fetch', network) })
afterEach(() => { cleanup(); setClientSession(null); vi.unstubAllGlobals() })
const view = () => render(<StrictMode><AuthBoundary><p>Содержимое дневника</p><SessionControls /></AuthBoundary></StrictMode>)

it('восстанавливает вход один раз в StrictMode, открывая дневник после проверки состояния', async () => {
  let finish: (value: Response) => void = () => { throw new Error('Нет запроса') }
  network.mockResolvedValueOnce(jsonResponse(clientSession)).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  view()
  expect(screen.getByRole('status')).toHaveTextContent('Проверяем вход')
  await waitFor(() => { expect(network).toHaveBeenCalledTimes(2) })
  expect(getClientSession().session).toBeNull()
  expect(screen.queryByText('Содержимое дневника')).not.toBeInTheDocument()
  finish(jsonResponse(clientDiary))
  expect(await screen.findByText('Содержимое дневника')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled()
  expect(network.mock.calls.map(call => call[0])).toEqual(['/api/v1/auth/session', '/api/v1/diary-state'])
})

it('сообщает об ошибке подключения и допускает повтор без открытия дневника', async () => {
  network.mockRejectedValueOnce(new Error('synthetic-network-error')).mockResolvedValueOnce(new Response('', { status: 401 }))
  view()
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте соединение')
  expect(screen.queryByText('Содержимое дневника')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Повторить подключение' }))
  expect(await screen.findByRole('form', { name: 'Вход в дневник' })).toBeVisible()
  expect(screen.getByLabelText('Логин')).toHaveFocus()
})

it('сохраняет ввод после неверного пароля и успешно входит с повтором', async () => {
  network.mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(jsonResponse(clientSession)).mockResolvedValueOnce(jsonResponse(clientDiary))
  view()
  await screen.findByRole('form', { name: 'Вход в дневник' })
  fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'Alice' } })
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'wrong' } })
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль')
  expect(screen.getByLabelText('Логин')).toHaveValue('Alice')
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: ' synthetic-password ' } })
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByText('Содержимое дневника')).toBeVisible()
  expect(network.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ login: 'alice', password: ' synthetic-password ' }))
})

it('ошибка выхода оставляет повтор, подтверждённый выход закрывает дневник', async () => {
  setClientSession(clientSession, clientDiary)
  network.mockResolvedValueOnce(new Response('', { status: 500 })).mockResolvedValueOnce(new Response(null, { status: 204 }))
  view()
  fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Сервер временно недоступен')
  expect(screen.getByText('Содержимое дневника')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
  expect(await screen.findByRole('form', { name: 'Вход в дневник' })).toBeVisible()
  expect(getClientSession().session).toBeNull()
  expect(getClientSession().diary).toBeNull()
})

it('смена входа уничтожает состояние прежнего содержимого', async () => {
  setClientSession(clientSession, clientDiary)
  render(<AuthBoundary><input aria-label="Учебный черновик" defaultValue="" /></AuthBoundary>)
  const field = screen.getByLabelText('Учебный черновик')
  fireEvent.change(field, { target: { value: 'Прежние учебные данные' } })
  act(() => { setClientSession({ ...clientSession, account: { ...clientSession.account, login: 'bob', id: '30000000-0000-4000-8000-000000000001' } }, clientDiary) })
  expect(await screen.findByLabelText('Учебный черновик')).toHaveValue('')
  expect(field).not.toBeInTheDocument()
})

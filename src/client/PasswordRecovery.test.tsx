import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthBoundary } from './AuthBoundary'
import { getClientSession, setClientSession } from './session'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'

const network = vi.fn<typeof fetch>(), token = 'a'.repeat(64), password = ' synthetic-new-password '
beforeEach(() => {
  window.history.replaceState(null, '', '/'); setClientSession(null); network.mockReset()
  vi.stubGlobal('fetch', network); vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); setClientSession(null); vi.unstubAllGlobals() })
function openLink(purpose = 'verify_email', secret = token) {
  window.history.replaceState(null, '', '/#auth=' + purpose + '&token=' + secret)
  render(<AuthBoundary><p>Учебный дневник</p></AuthBoundary>)
}
function fill(secret = password, confirmation = secret) {
  fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: secret } })
  fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: confirmation } })
}

it.each(['verify_email', 'reset_password'])('открывает %s, сразу убирает секрет из URL и не погашает автоматически', purpose => {
  openLink(purpose)
  expect(screen.getByRole('heading', { name: 'Задайте новый пароль' })).toBeVisible()
  expect(screen.getByLabelText('Новый пароль')).toHaveFocus()
  expect(window.location.hash).toBe('')
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0)
  expect(network).not.toHaveBeenCalled()
})

it('валидирует длину/совпадение, показывает пароль и не отправляет неверный ввод', () => {
  openLink(); fill('short')
  fireEvent.submit(screen.getByRole('form'))
  expect(screen.getByLabelText('Новый пароль')).toHaveAccessibleDescription(/15 до 1024/)
  expect(screen.getByLabelText('Новый пароль')).toHaveFocus()
  fill(password, 'other-synthetic-password')
  fireEvent.submit(screen.getByRole('form'))
  expect(screen.getByLabelText('Повторите пароль')).toHaveAccessibleDescription('Пароли должны совпадать.')
  expect(screen.getByLabelText('Повторите пароль')).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Показать пароли' }))
  expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('type', 'text')
  expect(network).not.toHaveBeenCalled()
})

it('сохраняет пробелы пароля, отправляет секрет только в body и закрывает прежний клиентский вход', async () => {
  setClientSession(clientSession, clientDiary)
  network.mockResolvedValueOnce(jsonResponse({ accepted: true }))
  openLink('reset_password'); fill()
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByRole('heading', { name: 'Пароль сохранён' })).toBeVisible()
  expect(getClientSession().session).toBeNull(); expect(getClientSession().diary).toBeNull()
  expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument()
  expect(network.mock.calls[0]?.[0]).toBe('/api/v1/auth/email/complete')
  expect(network.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ token, purpose: 'reset_password', password }))
  expect(network.mock.calls[0]?.[1]?.referrerPolicy).toBe('no-referrer')
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0)
  network.mockResolvedValueOnce(new Response('', { status: 401 }))
  fireEvent.click(screen.getByRole('button', { name: 'Перейти ко входу' }))
  expect(await screen.findByRole('form', { name: 'Вход в дневник' })).toBeVisible()
  expect(screen.getByLabelText('Пароль')).toHaveValue('')
})

it('объясняет использованную/истёкшую ссылку и даёт запросить новую', async () => {
  network.mockResolvedValueOnce(new Response('', { status: 400 }))
  openLink(); fill(); fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка недействительна или истекла')
  fireEvent.click(screen.getByRole('button', { name: 'Запросить новую ссылку' }))
  expect(screen.getByRole('form', { name: 'Подтверждение почты' })).toBeVisible()
  expect(screen.getByLabelText('Почта')).toHaveFocus()
  network.mockResolvedValueOnce(jsonResponse({ accepted: true }))
  fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'synthetic@example.test' } })
  fireEvent.submit(screen.getByRole('form'))
  await screen.findByRole('status')
  expect(network.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ email: 'synthetic@example.test', purpose: 'verify_email' }))
})

it('не отправляет неверную ссылку и обрабатывает ссылку в уже открытом дневнике', () => {
  setClientSession(clientSession, clientDiary)
  render(<AuthBoundary><p>Учебный дневник</p></AuthBoundary>)
  act(() => {
    window.history.replaceState(null, '', '/#auth=reset_password&token=invalid')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Ссылка недействительна')
  expect(screen.queryByText('Учебный дневник')).not.toBeInTheDocument()
  expect(window.location.hash).toBe(''); expect(network).not.toHaveBeenCalled()
})

it('запоздалый bootstrap не возвращает прежние данные после открытия ссылки', async () => {
  let finish: (value: Response) => void = () => { throw new Error('Нет bootstrap') }
  network.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  render(<AuthBoundary><p>Учебный дневник</p></AuthBoundary>)
  act(() => {
    window.history.replaceState(null, '', '/#auth=reset_password&token=' + token)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  network.mockResolvedValueOnce(jsonResponse({ accepted: true }))
  fill(); fireEvent.submit(screen.getByRole('form'))
  await screen.findByRole('heading', { name: 'Пароль сохранён' })
  await act(async () => { finish(jsonResponse(clientSession)); await Promise.resolve() })
  expect(getClientSession().session).toBeNull()
  expect(network.mock.calls.map(call => call[0])).toEqual(['/api/v1/auth/session', '/api/v1/auth/email/complete'])
  expect(screen.queryByText('Учебный дневник')).not.toBeInTheDocument()
})

it('новая ссылка в той же вкладке очищает пароль и ошибку предыдущей формы', async () => {
  openLink(); fill('short'); fireEvent.submit(screen.getByRole('form'))
  expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('aria-invalid', 'true')
  const next = 'b'.repeat(64)
  act(() => {
    window.history.replaceState(null, '', '/#auth=reset_password&token=' + next)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  expect(screen.getByLabelText('Новый пароль')).toHaveValue('')
  expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('aria-invalid', 'false')
  network.mockResolvedValueOnce(jsonResponse({ accepted: true }))
  fill(); fireEvent.submit(screen.getByRole('form'))
  await screen.findByRole('heading', { name: 'Пароль сохранён' })
  expect(network.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ token: next, purpose: 'reset_password', password }))
})

it('запрашивает восстановление без раскрытия аккаунта, сохраняет ввод при ошибке и блокирует повтор', async () => {
  network.mockResolvedValueOnce(new Response('', { status: 401 }))
  render(<AuthBoundary><p>Учебный дневник</p></AuthBoundary>)
  fireEvent.click(await screen.findByRole('button', { name: 'Забыли пароль?' }))
  fireEvent.submit(screen.getByRole('form'))
  expect(screen.getByLabelText('Почта')).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'Synthetic@EXAMPLE.TEST' } })
  network.mockRejectedValueOnce(new Error('synthetic-network-error'))
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте соединение')
  expect(screen.getByLabelText('Почта')).toHaveValue('Synthetic@EXAMPLE.TEST')
  let finish: (value: Response) => void = () => { throw new Error('Нет запроса') }
  network.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  fireEvent.submit(screen.getByRole('form'))
  await waitFor(() => { expect(network).toHaveBeenCalledTimes(3) })
  fireEvent.submit(screen.getByRole('form'))
  expect(screen.getByRole('button', { name: 'Подождите…' })).toBeDisabled()
  expect(network).toHaveBeenCalledTimes(3)
  act(() => { finish(jsonResponse({ accepted: true })) })
  expect(await screen.findByRole('status')).toHaveTextContent('Если запрос доступен')
  expect(getClientSession().session).toBeNull()
})

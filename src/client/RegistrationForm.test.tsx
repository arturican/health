import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthBoundary } from './AuthBoundary'
import { getClientSession, setClientSession } from './session'
import { jsonResponse } from '../../tests/clientSession'

const network = vi.fn<typeof fetch>()
beforeEach(() => { setClientSession(null); network.mockReset(); vi.stubGlobal('fetch', network); vi.stubGlobal('BroadcastChannel', undefined) })
afterEach(() => { cleanup(); setClientSession(null); vi.unstubAllGlobals() })
async function open() {
  network.mockResolvedValueOnce(new Response('', { status: 401 }))
  render(<AuthBoundary><p>Дневник</p></AuthBoundary>)
  fireEvent.click(await screen.findByRole('button', { name: 'Зарегистрироваться' }))
  await waitFor(() => { expect(screen.getByLabelText('Почта')).toHaveFocus() })
}
function fill() {
  fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'Alice@EXAMPLE.TEST' } })
  fireEvent.change(screen.getByLabelText('Часовой пояс дневника'), { target: { value: 'Europe/Moscow' } })
}

it('сообщает ошибки, фокусирует неверное поле и не спрашивает пароль до письма', async () => {
  await open()
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(screen.getByLabelText('Почта')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Почта')).toHaveFocus()
  expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument()
  fill()
  fireEvent.change(screen.getByLabelText('Часовой пояс дневника'), { target: { value: 'Mars/Base' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(screen.getByLabelText('Часовой пояс дневника')).toHaveFocus()
  expect(network).toHaveBeenCalledTimes(1)
})

it('отменяет регистрацию и возвращает фокус на почту входа', async () => {
  await open(); fill()
  fireEvent.click(screen.getByRole('button', { name: 'Уже есть аккаунт? Войти' }))
  expect(screen.getByRole('form', { name: 'Вход в дневник' })).toBeVisible()
  expect(screen.getByLabelText('Пароль')).toHaveValue('')
  await waitFor(() => { expect(screen.getByLabelText('Почта')).toHaveFocus() })
})

it('сохраняет ввод при отказе, блокирует повтор и показывает нейтральное подтверждение', async () => {
  await open(); fill()
  network.mockRejectedValueOnce(new Error('synthetic-private-error'))
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте соединение')
  expect(screen.getByLabelText('Почта')).toHaveValue('Alice@EXAMPLE.TEST')
  let finish: (response: Response) => void = () => { throw new Error('Нет запроса') }
  network.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  await waitFor(() => { expect(network).toHaveBeenCalledTimes(3) })
  expect(screen.getByRole('button', { name: 'Отправляем…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Уже есть аккаунт? Войти' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(network).toHaveBeenCalledTimes(3)
  act(() => { finish(jsonResponse({ accepted: true })) })
  expect(await screen.findByRole('status')).toHaveTextContent('Если регистрация доступна')
  expect(getClientSession().session).toBeNull()
  expect(screen.queryByText('Дневник', { exact: true })).not.toBeInTheDocument()
})

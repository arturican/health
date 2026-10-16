import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthBoundary } from './AuthBoundary'
import { setClientSession } from './session'
import { clientSession, jsonResponse } from '../../tests/clientSession'

const network = vi.fn<typeof fetch>()
beforeEach(() => { setClientSession(null); network.mockReset(); vi.stubGlobal('fetch', network); vi.stubGlobal('BroadcastChannel', undefined) })
afterEach(() => { cleanup(); setClientSession(null); vi.unstubAllGlobals() })
async function open() {
  network.mockResolvedValueOnce(new Response('', { status: 401 }))
  render(<AuthBoundary><p>Дневник</p></AuthBoundary>)
  fireEvent.click(await screen.findByRole('button', { name: 'Зарегистрироваться' }))
  await waitFor(() => { expect(screen.getByLabelText('Логин')).toHaveFocus() })
}
function fill(password = ' synthetic-password ') {
  fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'Alice' } })
  fireEvent.change(screen.getByLabelText('Пароль', { exact: true }), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Часовой пояс дневника'), { target: { value: 'Europe/Moscow' } })
}

it('сообщает ошибки полей и несовпадение паролей без запроса', async () => {
  await open()
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(screen.getByLabelText('Логин')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Пароль', { exact: true })).toHaveAccessibleDescription(/от 15 до 1024/)
  fill()
  fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'other-synthetic-password' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(screen.getByLabelText('Повторите пароль')).toHaveAccessibleDescription('Пароли должны совпадать.')
  expect(screen.getByLabelText('Повторите пароль')).toHaveFocus()
  expect(network).toHaveBeenCalledTimes(1)
})

it('показывает пароли по запросу, отменяет форму и удаляет прежние пароли', async () => {
  await open(); fill()
  expect(screen.getByLabelText('Пароль', { exact: true })).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Показать пароли' }))
  expect(screen.getByLabelText('Пароль', { exact: true })).toHaveAttribute('type', 'text')
  expect(screen.getByLabelText('Повторите пароль')).toHaveAttribute('type', 'text')
  fireEvent.click(screen.getByRole('button', { name: 'Уже есть аккаунт? Войти' }))
  expect(screen.getByRole('form', { name: 'Вход в дневник' })).toBeVisible()
  expect(screen.getByLabelText('Пароль')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
  expect(screen.getByLabelText('Повторите пароль')).toHaveValue('')
})

it('сохраняет ввод при конфликте, блокирует повтор и возвращает ко входу с пустым паролем', async () => {
  await open(); fill()
  network.mockResolvedValueOnce(new Response('', { status: 409 }))
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('логин уже занят')
  expect(screen.getByLabelText('Логин')).toHaveValue('Alice')
  let finish: (response: Response) => void = () => { throw new Error('Нет запроса') }
  network.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  await waitFor(() => { expect(network).toHaveBeenCalledTimes(3) })
  expect(screen.getByRole('button', { name: 'Создаём аккаунт…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Уже есть аккаунт? Войти' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('form', { name: 'Регистрация' }))
  expect(network).toHaveBeenCalledTimes(3)
  act(() => { finish(jsonResponse({ account: clientSession.account })) })
  expect(await screen.findByRole('status')).toHaveTextContent('Аккаунт создан')
  expect(screen.getByLabelText('Логин')).toHaveValue(clientSession.account.login)
  expect(screen.getByLabelText('Пароль')).toHaveValue('')
  await waitFor(() => { expect(screen.getByLabelText('Пароль')).toHaveFocus() })
  expect(screen.queryByText('Дневник', { exact: true })).not.toBeInTheDocument()
})

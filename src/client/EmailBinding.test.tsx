import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailBinding } from './EmailBinding'
import { setClientSession } from './session'
import { bindEmail, completeEmail, requestRecovery } from './emailRecovery'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'

const network = vi.fn<typeof fetch>()
beforeEach(() => { setClientSession(clientSession, clientDiary); network.mockReset(); vi.stubGlobal('fetch', network) })
afterEach(() => { cleanup(); setClientSession(null); vi.unstubAllGlobals() })

it('не обращается к API без сессии и показывает только подтверждённый адрес своего аккаунта', async () => {
  setClientSession(null); const view = render(<EmailBinding />)
  expect(network).not.toHaveBeenCalled(); expect(view.container).toBeEmptyDOMElement()
  view.unmount(); setClientSession(clientSession, clientDiary)
  network.mockResolvedValueOnce(jsonResponse({ email: 'synthetic@example.test', verified: true }))
  render(<EmailBinding />)
  expect(await screen.findByText('synthetic@example.test — подтверждена.')).toBeVisible()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
})

it('допускает повтор проверки после сетевого отказа', async () => {
  network.mockRejectedValueOnce(new Error('synthetic-network')).mockResolvedValueOnce(jsonResponse({ email: null, verified: false }))
  render(<EmailBinding />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте соединение')
  fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку почты' }))
  expect(await screen.findByRole('form', { name: 'Привязка почты' })).toBeVisible()
})

it('проверяет текущий пароль, сохраняет ввод при отказе и очищает после нейтрального подтверждения', async () => {
  network.mockResolvedValueOnce(jsonResponse({ email: null, verified: false }))
  render(<EmailBinding />)
  await screen.findByRole('form')
  fireEvent.change(screen.getByLabelText('Почта для восстановления'), { target: { value: 'Synthetic@EXAMPLE.TEST' } })
  fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'synthetic-old-password' } })
  network.mockResolvedValueOnce(new Response('', { status: 400 }))
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте почту и текущий пароль')
  expect(screen.getByLabelText('Текущий пароль')).toHaveValue('synthetic-old-password')
  network.mockResolvedValueOnce(jsonResponse({ accepted: true }))
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByRole('status')).toHaveTextContent('Если привязка доступна')
  await waitFor(() => { expect(screen.getByLabelText('Текущий пароль')).toHaveValue('') })
  expect(network.mock.calls[2]?.[0]).toBe('/api/v1/auth/email/bind')
  expect(new Headers(network.mock.calls[2]?.[1]?.headers).get('X-CSRF-Token')).toBe(clientSession.csrf)
})

it('отклоняет пустые/неверные данные всех операций до сети', async () => {
  await expect(bindEmail({})).rejects.toThrow('Проверьте почту')
  await expect(requestRecovery({ email: 'example.test', purpose: 'reset_password' })).rejects.toThrow('Введите почту')
  await expect(completeEmail({})).rejects.toThrow('Проверьте ссылку')
  expect(network).not.toHaveBeenCalled()
})

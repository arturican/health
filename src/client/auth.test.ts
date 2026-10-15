import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'
import { localDate } from '../domain/input'
import { login, logout, restoreSession } from './auth'
import { getClientSession, setClientSession } from './session'

const network = vi.fn<typeof fetch>()
beforeEach(() => { setClientSession(null); network.mockReset(); vi.stubGlobal('fetch', network); vi.stubGlobal('BroadcastChannel', undefined) })
afterEach(() => { setClientSession(null); vi.unstubAllGlobals() })

it('использует день аккаунта после входа и возвращает календарь браузера после выхода', async () => {
  const moment = new Date('2026-10-14T22:30:00Z'), browserDate = localDate(moment)
  network.mockResolvedValueOnce(jsonResponse(clientSession)).mockResolvedValueOnce(jsonResponse(clientDiary))
    .mockResolvedValueOnce(new Response(null, { status: 204, headers: { 'X-Account-Id': clientSession.account.id } }))
  await login({ login: 'alice', password: 'synthetic-password' })
  expect(localDate(moment)).toBe('2026-10-15')
  await logout()
  expect(localDate(moment)).toBe(browserDate)
  expect(getClientSession().session).toBeNull()
})

it('не публикует частичную сессию при неверном состоянии дневника и валидирует ввод', async () => {
  await expect(login({ login: 'bad login', password: '' })).rejects.toThrow('Введите логин и пароль')
  expect(network).not.toHaveBeenCalled()
  network.mockResolvedValueOnce(jsonResponse(clientSession)).mockResolvedValueOnce(jsonResponse({ ...clientDiary, generation: 'invalid' }))
  await expect(restoreSession()).rejects.toThrow('Не удалось получить данные')
  expect(getClientSession().session).toBeNull()
  expect(getClientSession().diary).toBeNull()
})

it('просроченная сессия при выходе очищается, неожиданный успешный статус не подтверждает выход', async () => {
  setClientSession(clientSession, clientDiary)
  network.mockResolvedValueOnce(jsonResponse(null)).mockResolvedValueOnce(new Response('', { status: 401 }))
  await expect(logout()).rejects.toMatchObject({ status: 500 })
  expect(getClientSession().session).not.toBeNull()
  await logout()
  expect(getClientSession().session).toBeNull()
})

it('ответ предыдущего восстановления не заменяет уже сменившийся вход', async () => {
  let finish: (value: Response) => void = () => { throw new Error('Нет запроса') }
  network.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const rejected = expect(restoreSession()).rejects.toThrow('Вход изменился')
  const bob = { ...clientSession, account: { ...clientSession.account, login: 'bob', id: '30000000-0000-4000-8000-000000000001' } }
  setClientSession(bob, clientDiary)
  finish(new Response('', { status: 401 }))
  await rejected
  expect(getClientSession().session).toEqual(bob)
})

it('проверяет владельца состояния после login и допускает новый bootstrap до окончания старого', async () => {
  const other = '30000000-0000-4000-8000-000000000001'
  network.mockResolvedValueOnce(jsonResponse(clientSession)).mockResolvedValueOnce(jsonResponse(clientDiary, other))
  await expect(login({ login: 'alice', password: 'synthetic-password' })).rejects.toMatchObject({ status: 401 })
  expect(getClientSession().session).toBeNull()
  let finish: (value: Response) => void = () => { throw new Error('Нет запроса') }
  network.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
    .mockResolvedValueOnce(jsonResponse(clientSession)).mockResolvedValueOnce(jsonResponse(clientDiary))
  const old = expect(restoreSession()).rejects.toThrow('Вход изменился')
  setClientSession(null)
  await restoreSession()
  finish(new Response('', { status: 401 }))
  await old
  expect(getClientSession().session).toEqual(clientSession)
})

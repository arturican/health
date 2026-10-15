import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { sessionSchema } from '../domain/session'
import { ApiError, requestApi, requestJSON } from './http'
import { getClientSession, setClientSession, subscribeSession } from './session'

const alice = { account: { id: '10000000-0000-4000-8000-000000000001', login: 'alice', timezone: 'Europe/Moscow' }, csrf: 'a'.repeat(64) }
const bob = { account: { id: '20000000-0000-4000-8000-000000000001', login: 'bob', timezone: 'UTC' }, csrf: 'b'.repeat(64) }
const network = vi.fn<typeof fetch>()
beforeEach(() => { setClientSession(alice); network.mockReset(); vi.stubGlobal('fetch', network) })
afterEach(() => { setClientSession(null); vi.unstubAllGlobals(); vi.useRealTimers() })
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Deferred не создан') }
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

it('проверяет контракт и хранит сессию только в памяти, уведомляя подписчиков', () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem'), open = vi.spyOn(indexedDB, 'open')
  const listener = vi.fn(), unsubscribe = subscribeSession(listener), previous = getClientSession()
  expect(() => { setClientSession({ ...alice, csrf: 'wrong' }) }).toThrow()
  expect(getClientSession()).toBe(previous)
  expect(() => sessionSchema.parse({ ...alice, account: { ...alice.account, timezone: 'Mars/Unknown' } })).toThrow()
  setClientSession(bob)
  expect(getClientSession().session).toEqual(bob)
  expect(getClientSession().epoch).toBe(previous.epoch + 1)
  expect(listener).toHaveBeenCalledOnce()
  expect(storage).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
  unsubscribe()
  setClientSession(null)
  expect(listener).toHaveBeenCalledOnce()
})

it('отправляет cookie/CSRF без кеша и проверяет JSON до выдачи вызывающему коду', async () => {
  network.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'X-Account-Id': alice.account.id } }))
  await expect(requestJSON('/api/v1/settings', z.strictObject({ ok: z.boolean() }), { method: 'PUT', value: { version: 1 } })).resolves.toEqual({ ok: true })
  const options = network.mock.calls[0]?.[1]
  expect(options).toMatchObject({ method: 'PUT', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', body: '{"version":1}' })
  expect(new Headers(options?.headers).get('x-csrf-token')).toBe(alice.csrf)
  expect(new Headers(options?.headers).get('content-type')).toBe('application/json')
  setClientSession(null)
  expect(options?.signal?.aborted).toBe(false) // Завершённый запрос снят с регистрации.
})

it.each([400, 401, 403, 404, 409, 413, 429, 500])('обрабатывает HTTP %s без показа серверного тела', async status => {
  network.mockResolvedValue(new Response('synthetic-secret-body', { status }))
  await expect(requestJSON('/api/v1/profile', z.unknown())).rejects.toMatchObject({ status })
  expect(new ApiError(status).message).not.toContain('synthetic-secret-body')
  expect(getClientSession().session).toEqual(status === 401 ? null : alice)
})

it('отклоняет некорректный ответ и сетевой сбой безопасным сообщением', async () => {
  for (const body of ['not-json', '{"count":"wrong"}']) {
    network.mockResolvedValue(new Response(body, { headers: { 'X-Account-Id': alice.account.id } }))
    await expect(requestJSON('/api/v1/steps', z.strictObject({ count: z.number() }))).rejects.toThrow('Не удалось получить данные')
  }
  network.mockRejectedValue(new Error('synthetic-network-detail'))
  await expect(requestJSON('/api/v1/profile', z.unknown())).rejects.toThrow('Проверьте соединение')
})

it('допускает анонимную проверку сессии, но не запрос личных данных', async () => {
  setClientSession(null)
  await expect(requestJSON('/api/v1/profile', z.unknown())).rejects.toMatchObject({ status: 401 })
  expect(network).not.toHaveBeenCalled()
  network.mockResolvedValue(new Response(JSON.stringify(alice)))
  await expect(requestJSON('/api/v1/auth/session', sessionSchema, { anonymous: true })).resolves.toEqual(alice)
})

it('отклоняет внешний origin, выход из API и фрагменты до сетевого запроса', async () => {
  for (const path of ['https://other.example/api/v1/profile', '//other.example/api/v1/profile', '/api/v1/../../private', '/api/v1/profile#secret', '/api/v1/\\other']) {
    await expect(requestJSON(path, z.unknown())).rejects.toThrow('Недопустимый адрес')
  }
  expect(network).not.toHaveBeenCalled()
})

it('смена пользователя отменяет запрос и не возвращает тело прежнего пользователя', async () => {
  const body = deferred<string>(), reading = deferred<undefined>()
  network.mockResolvedValue(new Response('', { headers: { 'X-Account-Id': alice.account.id } }))
  const pending = requestApi('/api/v1/profile', () => { reading.resolve(undefined); return body.promise })
  const rejected = expect(pending).rejects.toThrow('прежнему входу')
  await reading.promise
  setClientSession(bob)
  expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  body.resolve('Учебные данные Alice')
  await rejected
  expect(getClientSession().session).toEqual(bob)
})

it('прерывает зависшее соединение по тайм-ауту', async () => {
  vi.useFakeTimers()
  network.mockImplementation((_path, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  }))
  const rejected = expect(requestJSON('/api/v1/profile', z.unknown())).rejects.toThrow('Проверьте соединение')
  await vi.advanceTimersByTimeAsync(130000)
  await rejected
  expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
})

it.each([null, bob.account.id])('не читает тело ответа с несовпадающим владельцем %s', async owner => {
  network.mockResolvedValue(new Response('Учебные данные другого входа', { headers: owner ? { 'X-Account-Id': owner } : {} }))
  const read = vi.fn((response: Response) => response.text())
  await expect(requestApi('/api/v1/profile', read)).rejects.toMatchObject({ status: 401 })
  expect(read).not.toHaveBeenCalled()
  expect(getClientSession().session).toBeNull()
})

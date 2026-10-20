// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { testDatabase } from '../../tests/serverDatabase'
import { createApi } from './app'
import { registerReadiness } from './readiness'

let database: Awaited<ReturnType<typeof testDatabase>>
let app: ReturnType<typeof createApi>
beforeEach(async () => {
  database = await testDatabase()
  app = createApi()
})
afterEach(async () => {
  await app.close()
  vi.restoreAllMocks()
  await database.close()
})

it('без настроенной БД возвращает 503, liveness остаётся доступным', async () => {
  registerReadiness(app, null)
  const response = await app.inject('/api/v1/readiness')
  expect(response.statusCode).toBe(503)
  expect(response.json<unknown>()).toEqual({ status: 'unavailable' })
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect((await app.inject('/api/v1/health')).statusCode).toBe(200)
})

it('реальная SQL-проба имеет deadline и возвращает исправное соединение в pool', async () => {
  const client = await database.runtime.connect()
  client.release()
  const query = vi.spyOn(client, 'query')
  registerReadiness(app, database.runtime)
  const response = await app.inject('/api/v1/readiness')
  expect(response.statusCode).toBe(200)
  expect(response.json<unknown>()).toEqual({ status: 'ready' })
  expect(query).toHaveBeenCalledWith({ text: 'SELECT 1', query_timeout: 1000 })
  expect(database.runtime.totalCount).toBe(1)
  expect(database.runtime.idleCount).toBe(1)
  expect(response.headers['x-account-id']).toBeUndefined()
})

it('ошибка получения соединения скрыта, после восстановления проба проходит', async () => {
  vi.spyOn(database.runtime, 'connect').mockRejectedValueOnce(new Error('synthetic-private-connection-password'))
  registerReadiness(app, database.runtime)
  const failed = await app.inject('/api/v1/readiness')
  expect(failed.statusCode).toBe(503)
  expect(failed.json<unknown>()).toEqual({ status: 'unavailable' })
  expect(failed.body).not.toContain('synthetic-private')
  expect((await app.inject('/api/v1/health')).statusCode).toBe(200)
  expect((await app.inject('/api/v1/readiness')).statusCode).toBe(200)
})

it.each(['synthetic query error', 'Query read timeout'])('сбой SQL уничтожает клиент: %s', async reason => {
  const client = await database.runtime.connect()
  vi.spyOn(client, 'query').mockRejectedValueOnce(new Error(reason))
  client.release()
  registerReadiness(app, database.runtime)
  const failed = await app.inject('/api/v1/readiness')
  expect(failed.statusCode).toBe(503)
  expect(failed.json<unknown>()).toEqual({ status: 'unavailable' })
  expect(database.runtime.totalCount).toBe(0)
  expect(database.runtime.idleCount).toBe(0)
  expect(failed.body).not.toContain(reason)
  expect((await app.inject('/api/v1/readiness')).statusCode).toBe(200)
})

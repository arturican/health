// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerSteps } from './stepsRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const day = '2026-10-15'
beforeEach(async () => { context = await testApi(registerSteps); headers = await context.headers() })
afterEach(async () => { await context.close() })
const put = (count: unknown, revision: number | null = null, date = day, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/steps/${date}`, headers: ownHeaders, payload: { value: { date, count }, revision } })
const remove = (revision = 1, ownHeaders = headers) => context.app.inject({ method: 'DELETE', url: `/api/v1/steps/${day}`, headers: ownHeaders, payload: { revision } })
const get = (ownHeaders = headers) => context.app.inject({ url: `/api/v1/steps/${day}`, headers: ownHeaders })

it('отличает пропуск от нуля, сохраняет изменение после входа и удаляет', async () => {
  expect((await get()).json<unknown>()).toBeNull()
  expect((await put(0)).json<unknown>()).toEqual({ value: { date: day, count: 0 }, revision: 1 })
  expect((await put(1000000, 1)).json<unknown>()).toEqual({ value: { date: day, count: 1000000 }, revision: 2 })
  headers = await context.headers()
  expect((await get()).json<unknown>()).toEqual({ value: { date: day, count: 1000000 }, revision: 2 })
  expect((await remove()).statusCode).toBe(409)
  expect((await remove(2)).statusCode).toBe(204)
  expect((await get()).json<unknown>()).toBeNull()
})

it('читает диапазон страницами, проверяет параметры, целые числа и даты', async () => {
  await put(100)
  await put(0, null, '2026-10-13')
  const list = (query: string) => context.app.inject({ url: `/api/v1/steps?${query}`, headers })
  expect((await list('from=2026-10-12&to=2026-10-15&limit=1')).json<unknown>()).toEqual({ items: [{ value: { date: day, count: 100 }, revision: 1 }], nextBefore: day })
  expect((await list('from=2026-10-12&to=2026-10-15&limit=1&before=2026-10-15')).json<unknown>()).toEqual({ items: [{ value: { date: '2026-10-13', count: 0 }, revision: 1 }], nextBefore: null })
  expect((await list('from=2026-10-14&to=2026-10-14')).json<unknown>()).toEqual({ items: [], nextBefore: null })
  for (const query of ['from=2026-10-15&to=2026-10-14', 'limit=101', 'before=bad', 'from=2026-02-30']) expect((await list(query)).statusCode).toBe(400)
  for (const count of [-1, 0.1, 1000001, null, '0']) expect((await put(count, 1)).statusCode).toBe(400)
  expect((await put(1, null, '2026-10-16')).statusCode).toBe(400)
  context.now.setUTCHours(22)
  expect((await put(1, null, '2026-10-16')).statusCode).toBe(200)
})

it('конкурентное сохранение одной ревизии не теряет данные', async () => {
  await put(0)
  const responses = await Promise.all([put(100, 1), put(200, 1)])
  expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409])
  expect((await get()).json<unknown>()).toEqual(responses.find(response => response.statusCode === 200)?.json<unknown>())
})

it('чужие шаги нельзя прочитать, изменить или удалить', async () => {
  await put(100)
  const bob = await context.headers('bob')
  expect((await get(bob)).json<unknown>()).toBeNull()
  expect((await put(200, 1, day, bob)).statusCode).toBe(409)
  expect((await remove(1, bob)).statusCode).toBe(404)
  expect((await context.app.inject({ url: '/api/v1/steps', headers: bob })).json<unknown>()).toEqual({ items: [], nextBefore: null })
  expect((await context.app.inject({ url: '/api/v1/steps' })).statusCode).toBe(401)
  expect((await get()).json<unknown>()).toEqual({ value: { date: day, count: 100 }, revision: 1 })
})

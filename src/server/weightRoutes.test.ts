// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerProfile } from './profileRoutes'
import { registerWeights } from './weightRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const profile = { id: 'self', name: 'Учебный профиль', heightCm: 175, birthDate: '1990-01-01', formulaSex: 'none' }
const first = { id: '10000000-0000-4000-8000-000000000001', date: '2026-10-10', kg: 75 }
beforeEach(async () => {
  context = await testApi((...args) => { registerProfile(...args); registerWeights(...args) })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const createProfile = () => context.app.inject({ method: 'POST', url: '/api/v1/profile', headers, payload: { profile, weight: first } })
const add = (value: unknown, revision: number | null = null) => context.app.inject({ method: 'POST', url: '/api/v1/weights', headers, payload: { value, revision } })
const edit = (value = first, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/weights/${value.id}`, headers: ownHeaders, payload: { value, revision } })
const remove = (revision = 1, ownHeaders = headers) => context.app.inject({ method: 'DELETE', url: `/api/v1/weights/${first.id}`, headers: ownHeaders, payload: { revision } })

it('читает пустую историю, сохраняет точность, правит и удаляет после нового входа', async () => {
  expect((await context.app.inject({ url: '/api/v1/weights', headers })).json<unknown>()).toEqual({ items: [], nextBefore: null })
  expect((await add(first)).statusCode).toBe(400)
  await createProfile()
  const value = { id: randomUUID(), date: '2026-10-15', kg: 75.123456789 }
  expect((await add(value)).json<unknown>()).toEqual({ value, revision: 1 })
  const changed = { ...first, kg: 0.000001 }
  expect((await edit(changed)).json<unknown>()).toEqual({ value: changed, revision: 2 })
  headers = await context.headers()
  expect((await context.app.inject({ url: '/api/v1/weights', headers })).json<unknown>()).toEqual({ items: [{ value, revision: 1 }, { value: changed, revision: 2 }], nextBefore: null })
  expect((await remove()).statusCode).toBe(409)
  expect((await remove(2)).statusCode).toBe(204)
  expect((await remove(2)).statusCode).toBe(404)
})

it('листает историю с asOf без пропусков и отклоняет неверные параметры', async () => {
  await createProfile()
  const second = { id: randomUUID(), date: '2026-10-11', kg: 600 }
  const third = { id: randomUUID(), date: '2026-10-12', kg: 74 }
  await add(second); await add(third)
  const get = (query: string) => context.app.inject({ url: `/api/v1/weights?${query}`, headers })
  expect((await get('limit=1&asOf=2026-10-11')).json<unknown>()).toEqual({ items: [{ value: second, revision: 1 }], nextBefore: second.date })
  expect((await get('limit=1&asOf=2026-10-11&before=2026-10-11')).json<unknown>()).toEqual({ items: [{ value: first, revision: 1 }], nextBefore: null })
  for (const query of ['limit=101', 'limit=0', 'limit=-1', 'limit=1.2', 'asOf=2026-02-30', 'before=bad', 'owner=alice']) {
    expect((await get(query)).statusCode).toBe(400)
  }
})

it('не теряет данные при конфликте дат, повторе создания и одновременной правке', async () => {
  await createProfile()
  expect((await add(first)).statusCode).toBe(409)
  expect((await add({ ...first, id: randomUUID() })).statusCode).toBe(409)
  const value = { id: randomUUID(), date: '2026-10-11', kg: 80 }
  await add(value)
  expect((await edit({ ...first, date: value.date })).statusCode).toBe(409)
  const results = await Promise.all([edit({ ...first, kg: 70 }), edit({ ...first, kg: 72 })])
  expect(results.map(result => result.statusCode).sort()).toEqual([200, 409])
  expect((await context.database.pool.query('SELECT revision::text FROM health.weights WHERE id=$1', [first.id])).rows).toEqual([{ revision: '2' }])
})

it('защищает чтение, правку и удаление от другого аккаунта и без сессии', async () => {
  await createProfile()
  expect((await context.app.inject({ url: '/api/v1/weights' })).statusCode).toBe(401)
  const bob = await context.headers('bob')
  expect((await context.app.inject({ url: '/api/v1/weights', headers: bob })).json<unknown>()).toEqual({ items: [], nextBefore: null })
  expect((await edit(first, 1, bob)).statusCode).toBe(404)
  expect((await remove(1, bob)).statusCode).toBe(404)
  expect((await context.database.pool.query('SELECT kg::text FROM health.weights')).rows).toEqual([{ kg: '75' }])
  expect((await add({ ...first, user_id: context.bob.id })).statusCode).toBe(400)
})

it('проверяет дату рождения, день аккаунта, числа, UUID и revision', async () => {
  await createProfile()
  for (const patch of [{ date: '1989-12-31' }, { date: '2026-10-16' }, { date: '2026-02-30' }, { kg: 0 }, { kg: 600.01 }, { kg: '70' }, { id: 'invalid' }]) {
    expect((await add({ ...first, id: randomUUID(), ...patch })).statusCode).toBe(400)
  }
  expect((await add({ ...first, id: randomUUID() }, 1)).statusCode).toBe(400)
  expect((await edit(first, 0)).statusCode).toBe(400)
  expect((await edit({ ...first, id: randomUUID() })).statusCode).toBe(404)
  context.now.setUTCHours(22)
  expect((await add({ ...first, id: randomUUID(), date: '2026-10-16' })).statusCode).toBe(201)
  expect((await add({ ...first, id: randomUUID(), date: profile.birthDate })).statusCode).toBe(201)
})

// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerWorkouts } from './workoutRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const workout = { id: '10000000-0000-4000-8000-000000000001', date: '2026-10-15', kind: 'Учебная прогулка', minutes: 35.123456789, kcal: null, source: 'Синтетические данные', note: '' }
beforeEach(async () => { context = await testApi(registerWorkouts); headers = await context.headers() })
afterEach(async () => { await context.close() })
const add = (value: unknown = workout) => context.app.inject({ method: 'POST', url: '/api/v1/workouts', headers, payload: { value, revision: null } })
const edit = (value: unknown = workout, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/workouts/${workout.id}`, headers: ownHeaders, payload: { value, revision } })
const remove = (revision = 1, ownHeaders = headers) => context.app.inject({ method: 'DELETE', url: `/api/v1/workouts/${workout.id}`, headers: ownHeaders, payload: { revision } })
const list = (query = '') => context.app.inject({ url: `/api/v1/workouts${query}`, headers })

it('создаёт, читает после входа, изменяет и удаляет точную длительность с неизвестным расходом', async () => {
  expect((await list()).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await add()).json<unknown>()).toEqual({ value: workout, revision: 1 })
  headers = await context.headers()
  expect((await list()).json<unknown>()).toEqual({ items: [{ value: workout, revision: 1 }], nextAfter: null })
  expect((await edit({ ...workout, kcal: 0, minutes: 0.0000001 })).json<unknown>()).toEqual({ value: { ...workout, kcal: 0, minutes: 0.0000001 }, revision: 2 })
  expect((await remove()).statusCode).toBe(409)
  expect((await remove(2)).statusCode).toBe(204)
  expect((await remove(2)).statusCode).toBe(404)
})

it('читает нужный день страницами и проверяет границы и формат', async () => {
  await add()
  const second = { ...workout, id: '20000000-0000-4000-8000-000000000001', minutes: 1440, kcal: 100000 }
  expect((await add(second)).statusCode).toBe(201)
  expect((await list('?limit=1')).json<unknown>()).toEqual({ items: [{ value: workout, revision: 1 }], nextAfter: workout.id })
  expect((await list(`?after=${workout.id}&limit=1`)).json<unknown>()).toEqual({ items: [{ value: second, revision: 1 }], nextAfter: null })
  expect((await list('?date=2026-10-14')).json<unknown>()).toEqual({ items: [], nextAfter: null })
  for (const query of ['limit=101', 'date=invalid', 'after=invalid', 'owner=alice']) expect((await list(`?${query}`)).statusCode).toBe(400)
  for (const patch of [{ kind: ' ' }, { minutes: 0 }, { minutes: 1441 }, { kcal: -1 }, { kcal: 100001 }, { date: '2026-10-16' }, { note: 'x'.repeat(501) }, { user_id: context.bob.id }]) {
    expect((await add({ ...workout, id: randomUUID(), ...patch })).statusCode).toBe(400)
  }
  expect((await edit({ ...workout, id: randomUUID() })).statusCode).toBe(400)
})

it('не дублирует UUID и обнаруживает одновременные изменения', async () => {
  await add()
  expect((await add()).statusCode).toBe(409)
  const responses = await Promise.all([edit({ ...workout, minutes: 20 }), edit({ ...workout, minutes: 30 })])
  expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409])
  expect((await context.database.pool.query('SELECT revision::text FROM health.workouts')).rows).toEqual([{ revision: '2' }])
})

it('защищает записи от другого владельца и запросов без входа', async () => {
  await add()
  const bob = await context.headers('bob')
  expect((await edit(workout, 1, bob)).statusCode).toBe(404)
  expect((await remove(1, bob)).statusCode).toBe(404)
  expect((await context.app.inject({ url: '/api/v1/workouts', headers: bob })).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await context.app.inject({ url: '/api/v1/workouts' })).statusCode).toBe(401)
  expect((await list()).json<unknown>()).toEqual({ items: [{ value: workout, revision: 1 }], nextAfter: null })
})

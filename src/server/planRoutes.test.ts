// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerPlans } from './planRoutes'
import { registerProfile } from './profileRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const input = { effectiveFrom: '2026-10-15', goalKcal: 2100, method: 'factor', manualKcal: null, factor: 1.4, source: 'Вымышленный учебный план' }
beforeEach(async () => {
  context = await testApi((...args) => { registerPlans(...args); registerProfile(...args) })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const add = (value: unknown = input, expectedRevision: number | null = null, id = randomUUID(), ownHeaders = headers) => context.app.inject({ method: 'POST', url: '/api/v1/energy-plans', headers: ownHeaders, payload: { id, value, expectedRevision } })
const effective = (date = input.effectiveFrom, ownHeaders = headers) => context.app.inject({ url: `/api/v1/energy-plans/effective/${date}`, headers: ownHeaders })

it('сохраняет неполный снимок без выдуманных значений, выбирает версию на дату и листает историю', async () => {
  expect((await effective()).json<unknown>()).toBeNull()
  const first = await add()
  expect(first.statusCode).toBe(201)
  expect(first.json<unknown>()).toMatchObject({ value: { snapshot: { kg: null, weightDate: null, heightCm: null, age: null, formulaSex: 'none' } }, revision: 1 })
  const second = await add({ ...input, effectiveFrom: '2026-10-20', method: 'manual', manualKcal: 0, factor: null }, 1)
  expect(second.statusCode).toBe(201)
  expect((await effective()).json<unknown>()).toEqual(first.json<unknown>())
  expect((await effective('2026-10-20')).json<unknown>()).toEqual(second.json<unknown>())
  expect((await effective('2026-10-14')).json<unknown>()).toBeNull()
  expect((await context.app.inject({ url: '/api/v1/energy-plans?limit=1', headers })).json<unknown>()).toEqual({ items: [second.json<unknown>()], nextBefore: 2 })
  expect((await context.app.inject({ url: '/api/v1/energy-plans?limit=1&before=2', headers })).json<unknown>()).toEqual({ items: [first.json<unknown>()], nextBefore: null })
})

it('снимок старой версии не меняется вслед за профилем и весом', async () => {
  const profile = { id: 'self', name: 'Учебный профиль', heightCm: 175, birthDate: '1990-10-16', formulaSex: 'male' }
  await context.app.inject({ method: 'POST', url: '/api/v1/profile', headers, payload: { profile, weight: { id: randomUUID(), date: '2026-10-14', kg: 75.25 } } })
  const first = await add()
  expect(first.json<unknown>()).toMatchObject({ value: { snapshot: { kg: 75.25, weightDate: '2026-10-14', heightCm: 175, age: 35, formulaSex: 'male' } } })
  await context.app.inject({ method: 'PUT', url: '/api/v1/profile', headers, payload: { value: { ...profile, heightCm: 180 }, revision: 1 } })
  await context.database.pool.query('UPDATE health.weights SET kg=70 WHERE user_id=$1', [context.alice.id])
  expect((await effective()).json<unknown>()).toEqual(first.json<unknown>())
  const second = await add(input, 1)
  expect(second.json<unknown>()).toMatchObject({ value: { snapshot: { kg: 70, heightCm: 180 } }, revision: 2 })
  expect((await effective()).json<unknown>()).toEqual(second.json<unknown>())
})

it('повтор UUID возвращает прежнюю версию даже в другой день и не меняет параметры', async () => {
  const id = randomUUID()
  const results = await Promise.all([add(input, null, id), add(input, null, id)])
  expect(results.map(result => result.statusCode)).toEqual([201, 201])
  expect(results[0].json<unknown>()).toEqual(results[1].json<unknown>())
  expect((await add({ ...input, goalKcal: 2200 }, null, id)).statusCode).toBe(409)
  context.now.setUTCDate(16)
  headers = await context.headers()
  expect((await add(input, null, id)).json<unknown>()).toEqual(results[0].json<unknown>())
  expect((await context.database.pool.query('SELECT * FROM health.energy_plans')).rowCount).toBe(1)
})

it('отклоняет неверные даты, способы, снимки и устаревшее состояние', async () => {
  for (const patch of [{ effectiveFrom: '2026-10-14' }, { method: 'manual' }, { method: 'none' }, { factor: 0 }, { goalKcal: -1 }, { snapshot: { kg: 70 } }]) {
    expect((await add({ ...input, ...patch })).statusCode).toBe(400)
  }
  const results = await Promise.all([add(), add()])
  expect(results.map(result => result.statusCode).sort()).toEqual([201, 409])
  for (const query of ['limit=101', 'before=0', 'before=9007199254740992', 'owner=alice']) {
    expect((await context.app.inject({ url: `/api/v1/energy-plans?${query}`, headers })).statusCode).toBe(400)
  }
  expect((await add({ ...input, method: 'none', factor: null }, 1)).statusCode).toBe(201)
})

it('изолирует планы и ключи команд разных владельцев', async () => {
  const id = randomUUID()
  await add(input, null, id)
  const bob = await context.headers('bob')
  expect((await effective(input.effectiveFrom, bob)).json<unknown>()).toBeNull()
  expect((await context.app.inject({ url: '/api/v1/energy-plans', headers: bob })).json<unknown>()).toEqual({ items: [], nextBefore: null })
  expect((await context.app.inject({ url: '/api/v1/energy-plans' })).statusCode).toBe(401)
  expect((await add({ ...input, goalKcal: 1900 }, null, id, bob)).statusCode).toBe(201)
  expect((await effective()).json<unknown>()).toMatchObject({ value: { goalKcal: 2100 } })
})

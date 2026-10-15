// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { registerFood } from './foodRoutes'
import { registerSteps } from './stepsRoutes'
import { registerWorkouts } from './workoutRoutes'
import { registerPlans } from './planRoutes'
import { registerProducts } from './productRoutes'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const id = '10000000-0000-4000-8000-000000000001'
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    registerFood(app, pool, authorize, clock)
    registerSteps(app, pool, authorize, clock)
    registerWorkouts(app, pool, authorize, clock)
    registerPlans(app, pool, authorize, clock)
    registerProducts(app, pool, authorize)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })

it('отклоняет запоздавшую еду, шаги, тренировки и планы без изменения таблиц', async () => {
  await context.database.pool.query('UPDATE health.settings SET generation=$1', [randomUUID()])
  const requests = [
    ['POST', '/food'], ['PUT', `/food/${id}`], ['DELETE', `/food/${id}`],
    ['PUT', '/steps/2026-10-15'], ['DELETE', '/steps/2026-10-15'],
    ['POST', '/workouts'], ['PUT', `/workouts/${id}`], ['DELETE', `/workouts/${id}`], ['POST', '/energy-plans'],
  ] as const
  for (const [method, route] of requests) expect((await context.app.inject({ method, url: `/api/v1${route}`, headers, payload: {} })).statusCode).toBe(409)
  for (const table of ['food_entries', 'steps', 'workouts', 'energy_plans', 'commands']) expect((await context.database.pool.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
})

it('повторяет порцию, тренировку, известный ноль шагов и план без новых записей', async () => {
  const product = { id, name: 'Учебный продукт', source: '', kcal: 100, protein: null, fat: 0, carbs: 10, archived: false }
  expect((await context.app.inject({ method: 'POST', url: '/api/v1/products', headers, payload: { value: product, revision: null } })).statusCode).toBe(201)
  const requests = [
    { method: 'POST', route: '/food', payload: { value: { id, date: '2026-10-15', meal: 'lunch', productId: id, grams: 125, note: '' }, revision: null }, status: 201 },
    { method: 'POST', route: '/workouts', payload: { value: { id, date: '2026-10-15', kind: 'Ходьба', minutes: 30, kcal: null, source: '', note: '' }, revision: null }, status: 201 },
    { method: 'PUT', route: '/steps/2026-10-15', payload: { value: { date: '2026-10-15', count: 0 }, revision: null }, status: 200 },
    { method: 'POST', route: '/energy-plans', payload: { id: randomUUID(), value: { effectiveFrom: '2026-10-15', goalKcal: 2100, method: 'none', manualKcal: null, factor: null, source: 'Учебный план' }, expectedRevision: null }, status: 201 },
    { method: 'DELETE', route: `/food/${id}`, payload: { revision: 1 }, status: 204 },
    { method: 'DELETE', route: `/workouts/${id}`, payload: { revision: 1 }, status: 204 },
    { method: 'DELETE', route: '/steps/2026-10-15', payload: { revision: 1 }, status: 204 },
  ] as const
  for (const request of requests) {
    const commandHeaders = { ...headers, 'idempotency-key': randomUUID() }
    const invoke = () => context.app.inject({ method: request.method, url: `/api/v1${request.route}`, headers: commandHeaders, payload: request.payload })
    const first = await invoke(), repeated = await invoke()
    expect(first.statusCode).toBe(request.status)
    expect(repeated.statusCode).toBe(request.status)
    if (request.status === 204) expect(repeated.body).toBe('')
    else expect(repeated.json<unknown>()).toEqual(first.json<unknown>())
  }
  for (const table of ['food_entries', 'steps', 'workouts']) expect((await context.database.pool.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
  expect((await context.database.pool.query('SELECT revision::text FROM health.energy_plans')).rows).toEqual([{ revision: '1' }])
})

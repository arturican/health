// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { registerProfile } from './profileRoutes'
import { registerWeights } from './weightRoutes'
import { registerProducts } from './productRoutes'
import { registerNutrition } from './nutritionRoutes'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const id = '10000000-0000-4000-8000-000000000001'
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    registerProfile(app, pool, authorize, clock)
    registerWeights(app, pool, authorize, clock)
    registerProducts(app, pool, authorize)
    registerNutrition(app, pool, authorize, clock)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })

it('отклоняет все запоздавшие команды до изменения дневника', async () => {
  await context.database.pool.query('UPDATE health.settings SET generation=$1', [randomUUID()])
  const requests = [
    ['POST', '/profile'], ['PUT', '/profile'], ['POST', '/weights'], ['PUT', `/weights/${id}`], ['DELETE', `/weights/${id}`],
    ['POST', '/products'], ['PUT', `/products/${id}`], ['PUT', '/nutrition-days/2026-10-15'], ['POST', '/food/copy'],
  ] as const
  for (const [method, route] of requests) {
    expect((await context.app.inject({ method, url: `/api/v1${route}`, headers, payload: {} })).statusCode).toBe(409)
  }
  for (const table of ['profiles', 'weights', 'products', 'nutrition_days', 'food_entries', 'commands']) {
    expect((await context.database.pool.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
  }
})

it('повторяет создание профиля, веса и продукта, правку полноты и удаление веса', async () => {
  const profile = { id: 'self', name: 'Синтетический профиль', heightCm: 175, birthDate: null, formulaSex: 'none' }
  const weight = { id, date: '2026-10-15', kg: 70 }
  const product = { id, name: 'Учебный продукт', source: '', kcal: 100, protein: null, fat: 0, carbs: 10, archived: false }
  const requests = [
    { method: 'POST', route: '/profile', payload: { profile, weight }, status: 201 },
    { method: 'POST', route: '/weights', payload: { value: { ...weight, id: randomUUID(), date: '2026-10-14' }, revision: null }, status: 201 },
    { method: 'POST', route: '/products', payload: { value: product, revision: null }, status: 201 },
    { method: 'PUT', route: '/nutrition-days/2026-10-15', payload: { value: { date: '2026-10-15', complete: true }, revision: null }, status: 200 },
    { method: 'PUT', route: '/nutrition-days/2026-10-15', payload: { value: { date: '2026-10-15', complete: false }, revision: 1 }, status: 200 },
    { method: 'DELETE', route: `/weights/${id}`, payload: { revision: 1 }, status: 204 },
  ] as const
  for (const request of requests) {
    const commandHeaders = { ...headers, 'idempotency-key': randomUUID() }
    const invoke = () => context.app.inject({ method: request.method, url: `/api/v1${request.route}`, headers: commandHeaders, payload: request.payload })
    const first = await invoke()
    expect(first.statusCode).toBe(request.status)
    const repeated = await invoke()
    expect(repeated.statusCode).toBe(request.status)
    if (request.status === 204) expect(repeated.body).toBe('')
    else expect(repeated.json<unknown>()).toEqual(first.json<unknown>())
  }
  expect((await context.database.pool.query('SELECT * FROM health.weights')).rowCount).toBe(1)
  expect((await context.database.pool.query('SELECT * FROM health.products')).rowCount).toBe(1)
  expect((await context.database.pool.query('SELECT revision::text FROM health.nutrition_days')).rows).toEqual([{ revision: '2' }])
})

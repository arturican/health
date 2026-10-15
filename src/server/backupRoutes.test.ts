// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { readTextBackup } from '../domain/backup'
import { registerBackups } from './backupRoutes'
import { registerProfile } from './profileRoutes'
import { registerProducts } from './productRoutes'
import { registerFood } from './foodRoutes'
import { registerNutrition } from './nutritionRoutes'
import { registerSteps } from './stepsRoutes'
import { registerWorkouts } from './workoutRoutes'
import { registerPlans } from './planRoutes'
import { readTextSnapshot } from './textSnapshot'
import { withUser } from './userTransaction'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
let pause: (() => Promise<void>) | undefined
beforeEach(async () => {
  pause = undefined
  context = await testApi((app, pool, authorize, clock) => {
    app.addHook('preHandler', async request => { if (request.routeOptions.url === '/api/v1/backup/text') await pause?.() })
    registerBackups(app, pool, authorize, clock)
    registerProfile(app, pool, authorize, clock)
    registerProducts(app, pool, authorize)
    registerFood(app, pool, authorize, clock)
    registerNutrition(app, pool, authorize, clock)
    registerSteps(app, pool, authorize, clock)
    registerWorkouts(app, pool, authorize, clock)
    registerPlans(app, pool, authorize, clock)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const download = (ownHeaders = headers) => context.app.inject({ url: '/api/v1/backup/text', headers: ownHeaders })

it('экспортирует все текстовые области и снимки без секретов, изолирует пустой аккаунт', async () => {
  const profile = { id: 'self', name: 'Учебный профиль 🧪', heightCm: 175, birthDate: null, formulaSex: 'none' }
  const weight = { id: randomUUID(), date: '2026-10-15', kg: 75.123456789 }
  const product = { id: randomUUID(), name: 'Учебный продукт', source: 'Вымышленный состав', kcal: 123, protein: null, fat: 0, carbs: 12, archived: false }
  const requests = [
    ['POST', '/profile', { profile, weight }],
    ['POST', '/products', { value: product, revision: null }],
    ['POST', '/food', { value: { id: randomUUID(), date: weight.date, meal: 'lunch', productId: product.id, grams: 125, note: '' }, revision: null }],
    ['PUT', `/products/${product.id}`, { value: { ...product, kcal: 999, archived: true }, revision: 1 }],
    ['PUT', `/nutrition-days/${weight.date}`, { value: { date: weight.date, complete: false }, revision: null }],
    ['PUT', `/steps/${weight.date}`, { value: { date: weight.date, count: 0 }, revision: null }],
    ['POST', '/workouts', { value: { id: randomUUID(), date: weight.date, kind: 'Прогулка', minutes: 30, kcal: null, source: '', note: '' }, revision: null }],
    ['POST', '/energy-plans', { id: randomUUID(), value: { effectiveFrom: weight.date, goalKcal: 2100, method: 'none', manualKcal: null, factor: null, source: '' }, expectedRevision: null }],
  ] as const
  for (const [method, route, payload] of requests) expect((await context.app.inject({ method, url: `/api/v1${route}`, headers, payload })).statusCode).toBe(method === 'POST' ? 201 : 200)
  const response = await download()
  expect(response.statusCode).toBe(200)
  const backup = readTextBackup(response.json<unknown>(), '2026-10-15')
  expect(backup.profile).toEqual(profile)
  expect(backup.weights).toEqual([weight])
  expect(backup.products).toEqual([{ ...product, kcal: 999, archived: true }])
  expect(backup.foodEntries).toHaveLength(1)
  expect(backup.foodEntries[0]?.snapshot).toMatchObject({ kcal: 123, protein: null, fat: 0 })
  expect(backup.nutritionDays).toEqual([{ date: weight.date, complete: false }])
  expect(backup.steps).toEqual([{ date: weight.date, count: 0 }])
  expect(backup.workouts[0]?.kcal).toBeNull()
  expect(backup.energyPlans[0]?.snapshot.kg).toBe(weight.kg)
  expect(response.headers['content-disposition']).toContain('health-diary-text-2026-10-15.json')
  expect(response.headers['cache-control']).toBe('no-store')
  for (const secret of ['password_hash', 'token_hash', 'generation', 'user_id', 'csrf']) expect(response.body).not.toContain(secret)
  const other = readTextBackup((await download(await context.headers('bob'))).json<unknown>(), '2026-10-15')
  expect(other.profile).toBeNull()
  for (const rows of [other.weights, other.products, other.foodEntries, other.nutritionDays, other.steps, other.workouts, other.energyPlans]) expect(rows).toEqual([])
  expect((await context.app.inject({ url: '/api/v1/backup/text' })).statusCode).toBe(401)
})

it('читает единый снимок даже при конкурентном добавлении продукта', async () => {
  const snapshot = await withUser(context.database.runtime, context.alice, async client => {
    await client.query('SELECT * FROM health.profiles')
    await context.database.pool.query("INSERT INTO health.products(user_id,id,name,source,kcal) VALUES ($1,$2,'Учебный продукт','',0)", [context.alice.id, randomUUID()])
    return readTextSnapshot(client, '2026-10-15', context.now.toISOString())
  })
  expect(snapshot.products).toEqual([])
  expect(readTextBackup((await download()).json<unknown>(), '2026-10-15').products).toHaveLength(1)
})

it('ограничивает параллельный экспорт и освобождает слот после ответа', async () => {
  let enter = () => { /* назначается ниже */ }, release = () => { /* назначается ниже */ }
  const entered = new Promise<void>(resolve => { enter = resolve })
  const waiting = new Promise<void>(resolve => { release = resolve })
  pause = async () => { enter(); await waiting }
  const pending = download().then(response => response)
  await entered
  try { expect((await download()).statusCode).toBe(429) } finally { release() }
  expect((await pending).statusCode).toBe(200)
  pause = undefined
  expect((await download()).statusCode).toBe(200)
})

it('не выдаёт копию больше 20 MiB и освобождает слот после ошибки', async () => {
  await context.database.pool.query(`INSERT INTO health.products(user_id,id,name,source,kcal)
    SELECT $1,gen_random_uuid(),repeat('x',120),repeat('y',160),0 FROM generate_series(1,80000)`, [context.alice.id])
  expect((await download()).statusCode).toBe(413)
  expect((await context.database.pool.query('SELECT count(*)::int AS count FROM health.products')).rows).toEqual([{ count: 80000 }])
  await context.database.pool.query('DELETE FROM health.products')
  expect((await download()).statusCode).toBe(200)
}, 15000)

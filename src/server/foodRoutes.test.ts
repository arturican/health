// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerFood } from './foodRoutes'
import { registerProducts } from './productRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const product = { id: randomUUID(), name: 'Учебный продукт', source: 'Вымышленный состав', kcal: 123.456789, protein: null, fat: 0, carbs: 12, archived: false }
const entry = { id: '10000000-0000-4000-8000-000000000001', date: '2026-10-15', meal: 'breakfast', productId: product.id, grams: 125, note: '' }
const changes = { id: entry.id, date: entry.date, meal: 'lunch', grams: 250, note: 'Правка' }
const snapshot = { name: product.name, source: product.source, kcal: product.kcal, protein: null, fat: 0, carbs: 12 }
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => { registerProducts(app, pool, authorize); registerFood(app, pool, authorize, clock) })
  headers = await context.headers()
  expect((await context.app.inject({ method: 'POST', url: '/api/v1/products', headers, payload: { value: product, revision: null } })).statusCode).toBe(201)
})
afterEach(async () => { await context.close() })
const add = (value: unknown = entry, ownHeaders = headers) => context.app.inject({ method: 'POST', url: '/api/v1/food', headers: ownHeaders, payload: { value, revision: null } })
const edit = (value: unknown = changes, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/food/${entry.id}`, headers: ownHeaders, payload: { value, revision } })
const remove = (revision = 1, ownHeaders = headers) => context.app.inject({ method: 'DELETE', url: `/api/v1/food/${entry.id}`, headers: ownHeaders, payload: { revision } })
const list = (query = '') => context.app.inject({ url: `/api/v1/food${query}`, headers })

it('сохраняет серверный снимок при правке и архивации продукта и после нового входа', async () => {
  expect((await list()).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await add()).json<unknown>()).toEqual({ value: { ...entry, snapshot }, revision: 1 })
  await context.app.inject({ method: 'PUT', url: `/api/v1/products/${product.id}`, headers, payload: { value: { ...product, kcal: 999, archived: true }, revision: 1 } })
  expect((await add({ ...entry, id: randomUUID() })).statusCode).toBe(409)
  expect((await edit()).json<unknown>()).toEqual({ value: { ...entry, ...changes, snapshot }, revision: 2 })
  headers = await context.headers()
  expect((await list()).json<unknown>()).toEqual({ items: [{ value: { ...entry, ...changes, snapshot }, revision: 2 }], nextAfter: null })
  expect((await remove()).statusCode).toBe(409)
  expect((await remove(2)).statusCode).toBe(204)
  expect((await remove(2)).statusCode).toBe(404)
})

it('проверяет страницы, даты и серверный состав', async () => {
  await add()
  const second = { ...entry, id: '20000000-0000-4000-8000-000000000001' }
  await add(second)
  expect((await list('?limit=1')).json<unknown>()).toEqual({ items: [{ value: { ...entry, snapshot }, revision: 1 }], nextAfter: entry.id })
  expect((await list(`?limit=1&after=${entry.id}`)).json<unknown>()).toEqual({ items: [{ value: { ...second, snapshot }, revision: 1 }], nextAfter: null })
  expect((await list('?date=2026-10-14')).json<unknown>()).toEqual({ items: [], nextAfter: null })
  for (const query of ['limit=101', 'date=2026-02-30', 'after=invalid', 'user_id=alice']) expect((await list(`?${query}`)).statusCode).toBe(400)
  for (const patch of [{ snapshot }, { date: '2026-10-16' }, { grams: 0 }, { grams: 100001 }, { meal: 'other' }, { productId: null }, { note: 'x'.repeat(501) }]) {
    expect((await add({ ...entry, id: randomUUID(), ...patch })).statusCode).toBe(400)
  }
  expect((await edit({ ...changes, productId: product.id })).statusCode).toBe(400)
  expect((await edit({ ...changes, date: '2026-10-16' })).statusCode).toBe(400)
  expect((await add({ ...entry, id: randomUUID(), grams: 0.00000001 })).statusCode).toBe(201)
})

it('чужой продукт/порция недоступны; подмена снимка и владельца запрещена', async () => {
  await add()
  const bob = await context.headers('bob')
  expect((await add({ ...entry, id: randomUUID() }, bob)).statusCode).toBe(404)
  expect((await edit(changes, 1, bob)).statusCode).toBe(404)
  expect((await remove(1, bob)).statusCode).toBe(404)
  expect((await context.app.inject({ url: '/api/v1/food', headers: bob })).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await context.app.inject({ url: '/api/v1/food' })).statusCode).toBe(401)
  expect((await add({ ...entry, id: randomUUID(), user_id: context.alice.id }, bob)).statusCode).toBe(400)
})

it('защищает от повтора создания и конкурирующих изменений', async () => {
  await add()
  expect((await add()).statusCode).toBe(409)
  const responses = await Promise.all([edit(), edit({ ...changes, grams: 300 })])
  expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409])
  expect((await context.database.pool.query('SELECT revision::text FROM health.food_entries')).rows).toEqual([{ revision: '2' }])
})

it('удаление продукта не лишает историю снимка или возможности правки', async () => {
  await add()
  await context.database.pool.query('DELETE FROM health.products')
  expect((await edit()).json<unknown>()).toEqual({ value: { ...entry, ...changes, productId: null, snapshot }, revision: 2 })
})

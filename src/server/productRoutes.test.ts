// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { registerProducts } from './productRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const product = { id: '10000000-0000-4000-8000-000000000001', name: 'Учебный продукт', source: 'Вымышленные данные', kcal: 100.123456789, protein: null, fat: 0, carbs: 100, archived: false }
beforeEach(async () => { context = await testApi(registerProducts); headers = await context.headers() })
afterEach(async () => { await context.close() })
const add = (value: unknown = product) => context.app.inject({ method: 'POST', url: '/api/v1/products', headers, payload: { value, revision: null } })
const edit = (value: unknown = product, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/products/${product.id}`, headers: ownHeaders, payload: { value, revision } })
const list = (query = '') => context.app.inject({ url: `/api/v1/products${query}`, headers })

it('сохраняет состав, правит и архивирует без изменения значений null/0', async () => {
  expect((await list()).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await add()).json<unknown>()).toEqual({ value: product, revision: 1 })
  expect((await edit({ ...product, archived: true })).json<unknown>()).toEqual({ value: { ...product, archived: true }, revision: 2 })
  expect((await list()).json<unknown>()).toEqual({ items: [], nextAfter: null })
  headers = await context.headers()
  expect((await list('?archived=true')).json<unknown>()).toEqual({ items: [{ value: { ...product, archived: true }, revision: 2 }], nextAfter: null })
  expect((await edit({ ...product, name: 'Правка' }, 2)).statusCode).toBe(200)
  expect((await context.app.inject({ url: `/api/v1/products/${product.id}`, headers })).json<unknown>()).toEqual({ value: { ...product, name: 'Правка' }, revision: 3 })
})

it('проверяет страницы, параметры и ограничения полей', async () => {
  await add()
  const second = { ...product, id: '20000000-0000-4000-8000-000000000001' }
  await add(second)
  expect((await list('?limit=1')).json<unknown>()).toEqual({ items: [{ value: product, revision: 1 }], nextAfter: product.id })
  expect((await list(`?limit=1&after=${product.id}`)).json<unknown>()).toEqual({ items: [{ value: second, revision: 1 }], nextAfter: null })
  for (const query of ['limit=101', 'limit=0', 'archived=1', 'after=invalid', 'user_id=alice']) expect((await list(`?${query}`)).statusCode).toBe(400)
  for (const patch of [{ name: ' ' }, { kcal: -1 }, { kcal: 10001 }, { protein: 101 }, { fat: -1 }, { carbs: '0' }, { archived: 1 }, { user_id: context.bob.id }]) {
    expect((await add({ ...product, id: randomUUID(), ...patch })).statusCode).toBe(400)
  }
  expect((await edit({ ...product, id: randomUUID() })).statusCode).toBe(400)
})

it('одновременная правка не теряет данные, повтор создания не дублирует продукт', async () => {
  await add()
  expect((await add()).statusCode).toBe(409)
  const responses = await Promise.all([edit({ ...product, kcal: 200 }), edit({ ...product, kcal: 300 })])
  expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409])
  expect((await context.database.pool.query('SELECT revision::text FROM health.products')).rows).toEqual([{ revision: '2' }])
})

it('не раскрывает чужие продукты и запрещает доступ без входа', async () => {
  await add()
  expect((await context.app.inject({ url: '/api/v1/products' })).statusCode).toBe(401)
  const bob = await context.headers('bob')
  expect((await context.app.inject({ url: `/api/v1/products/${product.id}`, headers: bob })).statusCode).toBe(404)
  expect((await edit(product, 1, bob)).statusCode).toBe(404)
  expect((await context.app.inject({ url: '/api/v1/products', headers: bob })).json<unknown>()).toEqual({ items: [], nextAfter: null })
})

it('ограничивает объём ответа и запись при полной квоте, оставляя доступной правку', async () => {
  await add()
  await context.database.pool.query(`INSERT INTO health.products(user_id,id,name,source,kcal)
    SELECT $1,gen_random_uuid(),'Учебный продукт','',0 FROM generate_series(1,$2)`, [context.alice.id, BACKUP_MAX_RECORDS - 1])
  const page = (await list()).json<{ items: unknown[], nextAfter: string | null }>()
  expect(page.items).toHaveLength(100)
  expect(page.nextAfter).not.toBeNull()
  expect((await add({ ...product, id: randomUUID() })).statusCode).toBe(400)
  expect((await edit({ ...product, archived: true })).statusCode).toBe(200)
})

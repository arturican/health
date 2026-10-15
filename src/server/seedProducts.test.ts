// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { initialProducts } from '../domain/initialProducts'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { registerProducts } from './productRoutes'
import { registerSettings } from './settingsRoutes'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => {
  context = await testApi((app, pool, authorize) => { registerProducts(app, pool, authorize); registerSettings(app, pool, authorize) })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const seed = (ownHeaders: Record<string, string> = headers, payload: unknown = {}) => context.app.inject({
  method: 'POST', url: '/api/v1/products/seed', headers: { 'content-type': 'application/json', ...ownHeaders }, payload: JSON.stringify(payload),
})
const state = () => context.app.inject({ url: '/api/v1/diary-state', headers })

it('создаёт примеры один раз, сохраняет совпавший продукт и изолирует владельцев', async () => {
  const example = initialProducts()[0]
  if (!example) throw new Error('Нет начального продукта')
  const value = { ...example, name: 'Моя учебная правка', archived: true }
  expect((await context.app.inject({ method: 'POST', url: '/api/v1/products', headers, payload: { value, revision: null } })).statusCode).toBe(201)
  const responses = await Promise.all([seed(), seed()])
  expect(responses.map(response => response.json<unknown>())).toEqual(expect.arrayContaining([{ added: 0 }, { added: 1 }]))
  expect((await context.app.inject({ url: `/api/v1/products/${value.id}`, headers })).json<unknown>()).toEqual({ value, revision: 1 })
  expect((await state()).json<unknown>()).toMatchObject({ catalogSeeded: true })
  expect((await seed(await context.headers('bob'))).json<unknown>()).toEqual({ added: 2 })
  expect((await context.database.pool.query('SELECT id FROM health.products')).rowCount).toBe(4)
  expect((await seed({ origin: headers.origin })).statusCode).toBe(401)
  expect((await seed(headers, { userId: context.bob.id })).statusCode).toBe(400)
})

it('готовый каталог демонстрации не дополняется примерами', async () => {
  await context.database.pool.query('UPDATE health.settings SET catalog_seeded=true WHERE user_id=$1', [context.alice.id])
  expect((await seed()).json<unknown>()).toEqual({ added: 0 })
  expect((await context.database.pool.query('SELECT id FROM health.products')).rowCount).toBe(0)
})

it('не переполняет метаданные, затем добавляет маркер при появлении места', async () => {
  await context.database.pool.query(`INSERT INTO health.legacy_metadata(user_id,id,value)
    SELECT $1,'legacy-'||i,'synthetic' FROM generate_series(1,$2::int) AS i`, [context.alice.id, BACKUP_MAX_RECORDS])
  expect((await seed()).json<unknown>()).toEqual({ added: 2 })
  expect((await state()).json<unknown>()).toMatchObject({ catalogSeeded: false })
  expect((await seed()).json<unknown>()).toEqual({ added: 0 })
  await context.database.pool.query('DELETE FROM health.legacy_metadata WHERE user_id=$1 AND id=$2', [context.alice.id, 'legacy-1'])
  expect((await seed()).json<unknown>()).toEqual({ added: 0 })
  expect((await state()).json<unknown>()).toMatchObject({ catalogSeeded: true })
}, 15000) // Реальная предельная таблица PostgreSQL под coverage.

it('нехватка места для второго продукта откатывает первый и служебные изменения', async () => {
  await context.database.pool.query(`INSERT INTO health.products(user_id,id,name,source,kcal)
    SELECT $1,gen_random_uuid(),'Учебный продукт','Синтетические данные',1 FROM generate_series(1,$2::int)`, [context.alice.id, BACKUP_MAX_RECORDS - 1])
  const before = (await state()).json<unknown>()
  expect((await seed()).statusCode).toBe(400)
  expect((await state()).json<unknown>()).toEqual(before)
  expect((await context.database.pool.query('SELECT id FROM health.products WHERE id=ANY($1::uuid[])', [initialProducts().map(product => product.id)])).rowCount).toBe(0)
  expect((await context.database.pool.query('SELECT id FROM health.products')).rowCount).toBe(BACKUP_MAX_RECORDS - 1)
}, 15000)

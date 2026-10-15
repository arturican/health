// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { testApi } from '../../tests/serverApi'
import { registerSettings } from './settingsRoutes'
import { withUser } from './userTransaction'
import { DEFAULT_VISIBILITY } from '../domain/visibility'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => { context = await testApi(registerSettings); headers = await context.headers() })
afterEach(async () => { await context.close() })
const read = (ownHeaders = headers) => context.app.inject({ url: '/api/v1/diary-state', headers: ownHeaders })
const save = (value: Record<string, unknown>, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: ownHeaders, payload: { value, revision } })

it('создаёт настройки один раз и сохраняет их после нового входа', async () => {
  const first = await read()
  expect(first.statusCode).toBe(200)
  const generation = z.object({ generation: z.uuid() }).parse(first.json<unknown>()).generation
  expect(first.json<unknown>()).toEqual({ generation, value: DEFAULT_VISIBILITY, revision: 1, catalogSeeded: false })
  expect((await read()).json<unknown>()).toEqual(first.json<unknown>())
  const value = { ...DEFAULT_VISIBILITY, showPhotos: false }
  expect((await save(value)).json<unknown>()).toEqual({ generation, value, revision: 2, catalogSeeded: false })
  headers = await context.headers()
  expect((await read()).json<unknown>()).toEqual({ generation, value, revision: 2, catalogSeeded: false })
  expect((await context.database.pool.query('SELECT * FROM health.settings')).rowCount).toBe(1)
})

it('изолирует настройки и отклоняет неизвестные поля и конфликтующие версии', async () => {
  await read()
  for (const value of [{ ...DEFAULT_VISIBILITY, user_id: context.bob.id }, { ...DEFAULT_VISIBILITY, showPhotos: 0 }, { ...DEFAULT_VISIBILITY, version: 2 }]) {
    expect((await save(value)).statusCode).toBe(400)
  }
  const results = await Promise.all([save({ ...DEFAULT_VISIBILITY, showPhotos: false }), save({ ...DEFAULT_VISIBILITY, showDocuments: false })])
  expect(results.map(result => result.statusCode).sort()).toEqual([200, 409])
  const bob = await context.headers('bob')
  expect((await read(bob)).json<unknown>()).toMatchObject({ value: DEFAULT_VISIBILITY, revision: 1 })
  expect((await context.app.inject({ url: '/api/v1/diary-state' })).statusCode).toBe(401)
  expect((await context.database.runtime.query('SELECT * FROM health.settings')).rowCount).toBe(0)
  await expect(withUser(context.database.runtime, context.alice, client => client.query('UPDATE health.settings SET user_id=$1', [context.bob.id]), true)).rejects.toMatchObject({ code: '42501' })
})

it('ограничивает старые метаданные, изолирует их и каскадно удаляет с аккаунтом', async () => {
  await read()
  for (const account of [context.alice, context.bob]) await withUser(context.database.runtime, account, client => client.query(
    'INSERT INTO health.legacy_metadata(user_id,id,value) VALUES ($1,$2,$3)', [account.id, 'synthetic-legacy', 'Учебное значение']), true)
  expect((await context.database.runtime.query('SELECT * FROM health.legacy_metadata')).rowCount).toBe(0)
  expect((await withUser(context.database.runtime, context.alice, client => client.query('SELECT user_id FROM health.legacy_metadata'))).rows).toEqual([{ user_id: context.alice.id }])
  expect((await withUser(context.database.runtime, context.alice, client => client.query('DELETE FROM health.legacy_metadata WHERE user_id=$1', [context.bob.id]), true)).rowCount).toBe(0)
  for (const id of ['section-visibility', 'catalog-seeded', 'diary-generation', '', 'a'.repeat(81)]) {
    await expect(context.database.pool.query('INSERT INTO health.legacy_metadata(user_id,id,value) VALUES ($1,$2,$3)', [context.alice.id, id, 'test'])).rejects.toMatchObject({ code: '23514' })
  }
  await expect(context.database.pool.query('UPDATE health.legacy_metadata SET value=$1', ['a'.repeat(20481)])).rejects.toMatchObject({ code: '23514' })
  await expect(context.database.pool.query('UPDATE health.settings SET revision=0')).rejects.toMatchObject({ code: '23514' })
  await context.database.pool.query('DELETE FROM health.users WHERE id=$1', [context.alice.id])
  expect((await context.database.pool.query('SELECT * FROM health.settings')).rowCount).toBe(0)
  expect((await context.database.pool.query('SELECT user_id FROM health.legacy_metadata')).rows).toEqual([{ user_id: context.bob.id }])
})

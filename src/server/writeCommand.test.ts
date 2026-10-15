// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { testApi } from '../../tests/serverApi'
import { DEFAULT_VISIBILITY } from '../domain/visibility'
import { registerSettings } from './settingsRoutes'
import { withUser } from './userTransaction'
import { runCommand } from './commands'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => { context = await testApi(registerSettings); headers = await context.headers() })
afterEach(async () => { await context.close() })
const payload = { value: { ...DEFAULT_VISIBILITY, showPhotos: false }, revision: 1 }
const save = (key: string, body = payload, ownHeaders: Record<string, string> = headers) => context.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...ownHeaders, 'idempotency-key': key }, payload: body })

it('одновременные повторы меняют данные один раз и возвращают сохранённый результат', async () => {
  const key = randomUUID()
  const responses = await Promise.all([save(key), save(key)])
  expect(responses.map(response => response.statusCode)).toEqual([200, 200])
  expect(responses[0].json<unknown>()).toEqual(responses[1].json<unknown>())
  expect(responses[0].json<unknown>()).toMatchObject({ value: payload.value, revision: 2 })
  headers = await context.headers()
  expect((await save(key)).json<unknown>()).toEqual(responses[0].json<unknown>())
  expect((await save(key, { ...payload, value: DEFAULT_VISIBILITY })).statusCode).toBe(409)
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(1)
})

it('проверяет поколение и ключ, оставляет возможность повторить после исправления ошибки', async () => {
  const key = randomUUID()
  expect((await save(key, payload, { ...headers, 'x-diary-generation': '' })).statusCode).toBe(400)
  expect((await save('not-a-uuid')).statusCode).toBe(400)
  await context.database.pool.query('UPDATE health.settings SET generation=$1 WHERE user_id=$2', [randomUUID(), context.alice.id])
  expect((await save(key)).statusCode).toBe(409)
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(0)
  headers = await context.headers()
  expect((await save(key, { ...payload, revision: 2 })).statusCode).toBe(409)
  expect((await save(key)).statusCode).toBe(200)
})

it('одинаковый ключ другого владельца не читает чужой результат', async () => {
  const key = randomUUID()
  const alice = await save(key)
  const bob = await context.headers('bob')
  const second = await save(key, { value: DEFAULT_VISIBILITY, revision: 1 }, bob)
  expect(second.statusCode).toBe(200)
  expect(second.json<unknown>()).not.toEqual(alice.json<unknown>())
  expect(second.json<unknown>()).toMatchObject({ value: DEFAULT_VISIBILITY })
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(2)
})

it('коллизия вложенного ключа откатывает изменение и обе команды', async () => {
  const key = randomUUID()
  await expect(withUser(context.database.runtime, context.alice, client => runCommand(client, context.alice.id, key, { outer: true }, z.object({ ok: z.boolean() }), async () => {
    await client.query('UPDATE health.settings SET show_photos=false')
    return runCommand(client, context.alice.id, key, { inner: true }, z.object({ ok: z.boolean() }), () => Promise.resolve({ ok: true }))
  }), true)).rejects.toMatchObject({ statusCode: 409 })
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(0)
  expect((await context.app.inject({ url: '/api/v1/diary-state', headers })).json<unknown>()).toMatchObject({ value: DEFAULT_VISIBILITY, revision: 1 })
})

it('версия защищает подтверждение и увеличивается только для новой успешной команды', async () => {
  const key = randomUUID()
  const confirmed = { ...headers, 'x-diary-revision': '0' }
  const results = await Promise.all([save(key, payload, confirmed), save(randomUUID(), payload, confirmed)])
  expect(results.map(result => result.statusCode).sort()).toEqual([200, 409])
  const read = () => context.app.inject({ url: '/api/v1/diary-state', headers })
  expect((await read()).json<unknown>()).toMatchObject({ changeRevision: 1 })
  expect((await save(randomUUID(), { ...payload, revision: 2 }, confirmed)).statusCode).toBe(409)
  expect((await save(randomUUID(), { ...payload, revision: 99 })).statusCode).toBe(409)
  expect((await read()).json<unknown>()).toMatchObject({ changeRevision: 1 })
  const nextKey = randomUUID()
  const nextHeaders = { ...headers, 'x-diary-revision': '1' }
  const next = await save(nextKey, { ...payload, revision: 2 }, nextHeaders)
  expect(next.statusCode).toBe(200)
  expect((await save(nextKey, { ...payload, revision: 2 }, nextHeaders)).json<unknown>()).toEqual(next.json<unknown>())
  expect((await read()).json<unknown>()).toMatchObject({ changeRevision: 2 })
  const bob = await context.headers('bob')
  expect((await context.app.inject({ url: '/api/v1/diary-state', headers: bob })).json<unknown>()).toMatchObject({ changeRevision: 0 })
})

it('не допускает неверную версию и переполнение счётчика', async () => {
  for (const revision of ['', '-1', '1.5', '9007199254740992']) {
    expect((await save(randomUUID(), payload, { ...headers, 'x-diary-revision': revision })).statusCode).toBe(400)
  }
  await context.database.pool.query('UPDATE health.settings SET change_revision=9007199254740991 WHERE user_id=$1', [context.alice.id])
  expect((await save(randomUUID())).statusCode).toBe(409)
  expect((await context.app.inject({ url: '/api/v1/diary-state', headers })).json<unknown>()).toMatchObject({ value: DEFAULT_VISIBILITY, changeRevision: Number.MAX_SAFE_INTEGER })
})

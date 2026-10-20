// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as accounts from './accounts'
import { createApi } from './app'
import { registerAuthentication } from './auth'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApi>
const origin = 'https://health.example.test'
beforeEach(async () => {
  database = await testDatabase(); await migrate(database.pool, await readMigrations())
  app = createApi()
  app.decorate('accountMail', { send: () => Promise.resolve(), close: () => Promise.resolve() })
  await registerAuthentication(app, database.runtime, origin)
})
afterEach(async () => { await app.close(); await database.close() })

it.each([null, {}, { login: 'new-user', password: 'synthetic-password', timezone: 'UTC' }])('не создаёт аккаунт через закрытый прежний маршрут', async value => {
  const result = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin, 'content-type': 'application/json' }, payload: JSON.stringify(value) })
  expect(result.statusCode).toBe(404)
  expect((await database.pool.query('SELECT * FROM health.users')).rowCount).toBe(0)
})

it('ограничивает четыре общих слота погашения и входа', async () => {
  let release: () => void = () => { throw new Error('Нет gate') }
  let ready: () => void = () => { throw new Error('Нет ready') }
  const hold = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { ready = resolve })
  let active = 0
  vi.spyOn(accounts, 'hashPassword').mockImplementation(async () => {
    if (++active === 4) ready()
    await hold
    return '$argon2id$synthetic-test-only'
  })
  const running = Promise.all(Array.from({ length: 4 }, () => app.inject({
    method: 'POST', url: '/api/v1/auth/email/complete', headers: { origin },
    payload: { token: 'a'.repeat(64), purpose: 'reset_password', password: 'synthetic-password' },
  })))
  await entered
  try {
    const blocked = await Promise.all(Array.from({ length: 4 }, () => app.inject({
      method: 'POST', url: '/api/v1/auth/login', headers: { origin },
      payload: { login: 'missing-user', password: 'synthetic-password' },
    })))
    expect(blocked.map(value => value.statusCode)).toEqual([429, 429, 429, 429])
  } finally { release() }
  expect((await running).map(value => value.statusCode)).toEqual([400, 400, 400, 400])
  expect((await database.pool.query('SELECT * FROM health.sessions')).rowCount).toBe(0)
})

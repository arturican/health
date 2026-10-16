// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createApi } from './app'
import { registerAuthentication } from './auth'
import { createRegistrationLimit } from './registration'
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
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => app.inject({
    method: 'POST', url: index < 4 ? '/api/v1/auth/email/complete' : '/api/v1/auth/login', headers: { origin },
    payload: index < 4 ? { token: 'a'.repeat(64), purpose: 'reset_password', password: 'synthetic-password' }
      : { login: 'missing-user', password: 'synthetic-password' },
  })))
  expect(results.slice(0, 4).every(value => value.statusCode === 400)).toBe(true)
  expect(results.slice(4).every(value => value.statusCode === 429)).toBe(true)
  expect((await database.pool.query('SELECT * FROM health.sessions')).rowCount).toBe(0)
})

it('лимит погашения имеет границу времени и ограниченную память', () => {
  const allow = createRegistrationLimit()
  for (let index = 0; index < 10; index++) expect(allow('same', 0)).toBe(true)
  expect(allow('same', 899999)).toBe(false)
  expect(allow('same', 900000)).toBe(true)
  for (let index = 0; index < 9999; index++) expect(allow(String(index), 900000)).toBe(true)
  expect(allow('overflow', 900000)).toBe(false)
  expect(allow('overflow', 1800000)).toBe(true)
})

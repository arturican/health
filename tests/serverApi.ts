import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { createApi } from '../src/server/app'
import { registerAuthentication } from '../src/server/auth'
import { createAccount } from '../src/server/accounts'
import { migrate, readMigrations } from '../src/server/migrations'
import { testDatabase } from './serverDatabase'

type Feature = (app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock: () => Date) => void
export async function testApi(register: Feature) {
  const database = await testDatabase()
  const app = createApi()
  const now = new Date('2026-10-15T12:00:00Z')
  const origin = 'https://health.example.test'
  const password = 'synthetic-password-only'
  try {
    await migrate(database.pool, await readMigrations())
    const alice = await createAccount(database.pool, { login: 'alice', password, timezone: 'Europe/Moscow' })
    const bob = await createAccount(database.pool, { login: 'bob', password, timezone: 'UTC' })
    const authorize = await registerAuthentication(app, database.runtime, origin, () => now)
    register(app, database.runtime, authorize, () => now)
    return { database, app, alice, bob, now, async headers(login = 'alice') {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { login, password } })
      const cookie = response.headers['set-cookie']
      if (response.statusCode !== 200 || typeof cookie !== 'string') throw new Error('Нет тестовой сессии')
      const csrf = z.object({ csrf: z.string() }).parse(response.json<unknown>()).csrf
      return { cookie, origin, 'x-csrf-token': csrf }
    }, async close() { await app.close(); await database.close() } }
  } catch (error) { await app.close(); await database.close(); throw error }
}

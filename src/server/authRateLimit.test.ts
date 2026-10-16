// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createAuthRateLimit } from './authRateLimit'
import { createApi } from './app'
import { registerAuthentication } from './auth'
import { createAccount } from './accounts'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApi> | undefined
const now = new Date('2026-10-16T10:00:00Z'), ip = '192.0.2.1'
beforeEach(async () => {
  database = await testDatabase(); await migrate(database.pool, await readMigrations())
  app = undefined
})
afterEach(async () => { await app?.close(); await database.close() })

it.each(['login', 'email_issue', 'email_bind', 'email_complete'] as const)('%s сохраняет бюджет между экземплярами, изолирует адреса и истекает на границе', async bucket => {
  const complete = bucket === 'email_complete', identity = complete ? null : 'synthetic@example.test'
  for (let i = 0; i < (complete ? 10 : 5); i++) expect(await createAuthRateLimit(database.runtime, bucket)(ip, identity, now)).toBe(true)
  const restarted = createAuthRateLimit(database.runtime, bucket)
  expect(await restarted(ip, identity, new Date(now.getTime() + 899999))).toBe(false)
  expect(await restarted('192.0.2.2', complete ? null : 'other@example.test', now)).toBe(true)
  expect(await restarted(ip, identity, new Date(now.getTime() + 900000))).toBe(true)
  const rows = await database.pool.query('SELECT digest FROM health.auth_rate_limits')
  expect(JSON.stringify(rows.rows)).not.toContain(ip)
  expect(JSON.stringify(rows.rows)).not.toContain('example.test')
})

it('сериализует конкурентные попытки и не смешивает бюджеты операций', async () => {
  const limit = createAuthRateLimit(database.runtime, 'login')
  const results = await Promise.all(Array.from({ length: 12 }, () => limit(ip, 'same', now)))
  expect(results.filter(Boolean)).toHaveLength(5)
  expect(await createAuthRateLimit(database.runtime, 'email_issue')(ip, 'same', now)).toBe(true)
  for (const sql of ['SELECT * FROM health.auth_rate_limits', 'DELETE FROM health.auth_rate_limits']) {
    await expect(database.runtime.query(sql)).rejects.toMatchObject({ code: '42501' })
  }
})

it('сохраняет минутный предел IP и ограничивает накопление ключей', async () => {
  const limit = createAuthRateLimit(database.runtime, 'login')
  for (let i = 0; i < 30; i++) expect(await limit(ip, String(i), now)).toBe(true)
  expect(await limit(ip, 'next', new Date(now.getTime() + 59999))).toBe(false)
  expect(await limit(ip, 'next', new Date(now.getTime() + 60000))).toBe(true)
  await database.pool.query('DELETE FROM health.auth_rate_limits')
  await database.pool.query(`INSERT INTO health.auth_rate_limits
    SELECT 'login',1,lpad(to_hex(n),64,'0'),1,$1 FROM generate_series(1,10000) n`, [new Date(now.getTime() + 900000)])
  expect(await limit(ip, 'new', now)).toBe(false)
  expect(await limit(ip, 'new', new Date(now.getTime() + 900000))).toBe(true)
  expect((await database.pool.query('SELECT * FROM health.auth_rate_limits')).rowCount).toBe(2)
})

it.each([
  ['unknown', 'a'.repeat(64), 'b'.repeat(64)],
  ['login', 'bad', 'b'.repeat(64)],
  ['login', 'a'.repeat(64), null],
  ['email_complete', 'a'.repeat(64), 'b'.repeat(64)],
])('отклоняет неверные SQL-параметры без записи: %s', async (bucket, address, identity) => {
  await expect(database.runtime.query('SELECT health.take_auth_attempt($1,$2,$3,$4)', [bucket, address, identity, now])).rejects.toMatchObject({ code: '23514' })
  expect((await database.pool.query('SELECT * FROM health.auth_rate_limits')).rowCount).toBe(0)
})

it('пересоздание HTTP API не обнуляет исчерпанный лимит входа', async () => {
  const origin = 'https://health.example.test', credentials = { login: 'synthetic', password: 'synthetic-password-only' }
  await createAccount(database.pool, { ...credentials, timezone: 'UTC' })
  const start = async () => { app = createApi(); await registerAuthentication(app, database.runtime, origin, () => now); return app }
  const post = (target: FastifyInstance) => target.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { ...credentials, password: 'incorrect-password-only' } })
  const first = await start()
  for (let i = 0; i < 5; i++) expect((await post(first)).statusCode).toBe(401)
  await first.close()
  expect((await post(await start())).statusCode).toBe(429)
})

it('ошибка проверки бюджета не разрешает вход и не раскрывает реквизиты', async () => {
  app = createApi()
  const origin = 'https://health.example.test'
  await registerAuthentication(app, database.runtime, origin, () => now)
  vi.spyOn(database.runtime, 'query').mockRejectedValueOnce(new Error('synthetic-private-database-detail'))
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { login: 'synthetic', password: 'synthetic-password-only' } })
  expect(response.statusCode).toBe(500)
  expect(response.headers['set-cookie']).toBeUndefined()
  expect(response.body).not.toContain('synthetic-private')
  expect((await database.pool.query('SELECT * FROM health.sessions')).rowCount).toBe(0)
})

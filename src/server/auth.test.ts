// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { createApi } from './app'
import { registerAuthentication } from './auth'
import { createAccount } from './accounts'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'
import { readCookie } from './httpSecurity'
import { createLoginLimit } from './loginLimit'

let database: Awaited<ReturnType<typeof testDatabase>>
let app: ReturnType<typeof createApi>
let time: Date
const origin = 'https://health.example.test'
const credentials = { login: 'demo', password: 'synthetic-password-only' }
beforeEach(async () => {
  database = await testDatabase()
  await migrate(database.pool, await readMigrations())
  await createAccount(database.pool, { ...credentials, timezone: 'Europe/Moscow' })
  time = new Date('2026-10-15T12:00:00Z')
  app = createApi()
  const authorize = await registerAuthentication(app, database.runtime, origin, () => time)
  app.get('/api/test/private', async (request, reply) => ({ account: await authorize(request, reply) }))
})
afterEach(async () => { await app.close(); await database.close() })

async function login() {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: credentials })
  expect(response.statusCode).toBe(200)
  const cookie = response.headers['set-cookie']
  if (typeof cookie !== 'string') throw new Error('Нет cookie')
  const body = z.object({ csrf: z.string(), account: z.object({ id: z.uuid(), login: z.string() }) }).parse(response.json<unknown>())
  expect(response.headers['x-account-id']).toBe(body.account.id)
  return { cookie, csrf: body.csrf }
}

it('устанавливает защищённую cookie, читает сессию и отзывает её при logout', async () => {
  const { cookie, csrf } = await login()
  for (const attribute of ['__Host-health_session=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=604800']) expect(cookie).toContain(attribute)
  expect(cookie).not.toContain('Domain=')
  const session = await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })
  expect(session.statusCode).toBe(200)
  expect(session.headers['cache-control']).toBe('no-store')
  const owner = z.object({ account: z.object({ id: z.uuid() }) }).parse(session.json<unknown>()).account.id
  expect(session.headers['x-account-id']).toBe(owner)
  expect((await app.inject({ url: '/api/test/private', headers: { cookie } })).headers['x-account-id']).toBe(owner)
  expect(session.body).not.toContain('password')
  expect(session.body).not.toContain(readCookie(cookie))
  const headers = { cookie, origin, 'x-csrf-token': csrf }
  for (let i = 0; i < 2; i++) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })
    expect(response.statusCode).toBe(204)
    expect(response.headers['set-cookie']).toContain('Max-Age=0')
    expect(response.headers['x-account-id']).toBe(i === 0 ? owner : undefined)
  }
  expect((await app.inject({ url: '/api/test/private', headers: { cookie } })).statusCode).toBe(401)
})

it('неавторизованный и просроченный запросы не получают аккаунт', async () => {
  const anonymous = await app.inject({ url: '/api/test/private' })
  expect(anonymous.statusCode).toBe(401)
  expect(anonymous.headers['x-account-id']).toBeUndefined()
  const { cookie } = await login()
  time = new Date(time.getTime() + 86400000)
  expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).statusCode).toBe(401)
})

it('не принимает чужой/отсутствующий Origin и неверный CSRF', async () => {
  for (const headers of [{}, { origin: 'https://attacker.example.test' }]) {
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers, payload: credentials })).statusCode).toBe(403)
  }
  const { cookie } = await login()
  for (const headers of [{ cookie, origin }, { cookie, origin, 'x-csrf-token': 'a'.repeat(64) }]) {
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })).statusCode).toBe(403)
  }
  expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).statusCode).toBe(200)
})

it('одинаково отвечает на неверный пароль и неизвестный логин', async () => {
  const responses = []
  for (const payload of [{ ...credentials, login: 'missing' }, { ...credentials, password: 'incorrect-password-only' }]) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload })
    expect(response.statusCode).toBe(401)
    responses.push(response.body)
    expect(response.headers['set-cookie']).toBeUndefined()
  }
  expect(responses[0]).toBe(responses[1])
})

it('ограничивает попытки независимо от поддельного forwarded IP и снимает лимит по времени', async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin, 'x-forwarded-for': `192.0.2.${String(attempt)}` }, payload: { ...credentials, password: 'incorrect-password-only' } })
    expect(response.statusCode).toBe(attempt < 5 ? 401 : 429)
  }
  time = new Date(time.getTime() + 900000)
  await login()
})

it('не принимает дублирующиеся cookie и проверяет общий лимит IP', () => {
  const token = 'a'.repeat(64)
  expect(readCookie(`__Host-health_session=${token}; __Host-health_session=${token}`)).toBeNull()
  expect(readCookie('__Host-health_session=invalid')).toBeNull()
  const limit = createLoginLimit()
  for (let i = 0; i < 30; i++) expect(limit('127.0.0.1', `login${String(i)}`, 0)).toBe(true)
  expect(limit('127.0.0.1', 'next', 59999)).toBe(false)
  expect(limit('127.0.0.1', 'next', 60000)).toBe(true)
})

it('отвергает подключение API с административной ролью', async () => {
  const unsafe = createApi()
  try { await expect(registerAuthentication(unsafe, database.pool, origin)).rejects.toThrow('ограниченную роль') }
  finally { await unsafe.close() }
})

it('не запускает больше четырёх параллельных проверок пароля', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => app.inject({
    method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: credentials,
  })))
  expect(responses.filter(response => response.statusCode === 200)).toHaveLength(4)
  expect(responses.filter(response => response.statusCode === 429)).toHaveLength(4)
})

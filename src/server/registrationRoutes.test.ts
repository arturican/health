// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createApi } from './app'
import { registerAuthentication } from './auth'
import { createRegistrationLimit } from './registration'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'
import { accountSchema } from '../domain/session'

let database: Awaited<ReturnType<typeof testDatabase>>
let app: ReturnType<typeof createApi>
let time: Date
const origin = 'https://health.example.test'
const payload = { login: ' New-user ', password: 'synthetic-register-password', timezone: 'UTC' }
beforeEach(async () => {
  database = await testDatabase(); await migrate(database.pool, await readMigrations())
  time = new Date('2026-10-16T10:00:00Z')
  app = createApi(); await registerAuthentication(app, database.runtime, origin, () => time)
})
afterEach(async () => { await app.close(); await database.close() })
const register = (value: unknown = payload) => app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin, 'content-type': 'application/json' }, payload: JSON.stringify(value) })

it('создаёт аккаунт без сессии, затем допускает обычный вход', async () => {
  const response = await register()
  expect(response.statusCode).toBe(201)
  const body = response.json<{ account: unknown }>()
  expect(accountSchema.parse(body.account).login).toBe('new-user')
  expect(response.headers['set-cookie']).toBeUndefined()
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.body).not.toContain('password')
  expect((await app.inject({ url: '/api/v1/auth/session' })).statusCode).toBe(401)
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { login: 'new-user', password: payload.password } })
  expect(login.statusCode).toBe(200)
  expect(login.headers['set-cookie']).toContain('HttpOnly; Secure; SameSite=Lax')
})

it('конкурентные регистрации одного логина дают 201 и 409 без замены аккаунта', async () => {
  const results = await Promise.all([register(), register()])
  expect(results.map(value => value.statusCode).sort()).toEqual([201, 409])
  const before = (await database.pool.query('SELECT * FROM health.users')).rows
  expect((await register({ ...payload, password: 'another-synthetic-password' })).statusCode).toBe(409)
  expect((await database.pool.query('SELECT * FROM health.users')).rows).toEqual(before)
})

it.each([null, {}, { ...payload, password: 'short' }, { ...payload, password: 'x'.repeat(1025) },
  { ...payload, login: 'bad name' }, { ...payload, timezone: 'Mars/Base' }, { ...payload, admin: true }])('возвращает 400 и не пишет неверный ввод', async value => {
  expect((await register(value)).statusCode).toBe(400)
  expect((await database.pool.query('SELECT id FROM health.users')).rowCount).toBe(0)
})

it('отклоняет отсутствующий и чужой Origin до записи', async () => {
  for (const headers of [{}, { origin: 'https://other.example.test' }]) {
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers, payload })).statusCode).toBe(403)
  }
  expect((await database.pool.query('SELECT id FROM health.users')).rowCount).toBe(0)
})

it('ограничивает попытки даже при смене forwarded IP, восстановление по времени не блокирует вход', async () => {
  await register()
  for (let index = 1; index <= 10; index++) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { origin, 'x-forwarded-for': `192.0.2.${String(index)}` }, payload: {} })
    expect(response.statusCode).toBe(index < 10 ? 400 : 429)
    if (index === 10) expect(response.headers['retry-after']).toBe('900')
  }
  expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { login: 'new-user', password: payload.password } })).statusCode).toBe(200)
  time = new Date(time.getTime() + 900000)
  expect((await register({ ...payload, login: 'after-limit' })).statusCode).toBe(201)
})

it('не хеширует больше четырёх регистраций одновременно', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => register({ ...payload, login: `new-${String(index)}` })))
  expect(results.filter(value => value.statusCode === 201)).toHaveLength(4)
  expect(results.filter(value => value.statusCode === 429)).toHaveLength(4)
})

it('лимит имеет границу времени и ограниченную память', () => {
  const allow = createRegistrationLimit()
  for (let index = 0; index < 10; index++) expect(allow('same', 0)).toBe(true)
  expect(allow('same', 899999)).toBe(false)
  expect(allow('same', 900000)).toBe(true)
  for (let index = 0; index < 9999; index++) expect(allow(String(index), 900000)).toBe(true)
  expect(allow('overflow', 900000)).toBe(false)
  expect(allow('overflow', 1800000)).toBe(true)
})

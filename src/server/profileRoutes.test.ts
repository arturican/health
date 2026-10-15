// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerProfile } from './profileRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const profile = { id: 'self', name: 'Учебный профиль', heightCm: 175, birthDate: '1990-01-01', formulaSex: 'none' }
const weight = { id: '10000000-0000-4000-8000-000000000001', date: '2026-10-15', kg: 75.123456789 }
beforeEach(async () => { context = await testApi(registerProfile); headers = await context.headers() })
afterEach(async () => { await context.close() })
const create = () => context.app.inject({ method: 'POST', url: '/api/v1/profile', headers, payload: { profile, weight } })

it('показывает отсутствие профиля, атомарно создаёт профиль с первым весом и читает после нового входа', async () => {
  expect((await context.app.inject({ url: '/api/v1/profile', headers })).json<unknown>()).toBeNull()
  const response = await create()
  expect(response.statusCode).toBe(201)
  expect(response.json<unknown>()).toEqual({ value: profile, revision: 1 })
  const otherSession = await context.headers()
  expect((await context.app.inject({ url: '/api/v1/profile', headers: otherSession })).json<unknown>()).toEqual({ value: profile, revision: 1 })
  expect((await context.database.pool.query('SELECT kg::text FROM health.weights')).rows).toEqual([{ kg: '75.123456789' }])
  expect((await create()).statusCode).toBe(409)
})

it('две конкурентные правки одной ревизии не теряют изменение', async () => {
  await create()
  const responses = await Promise.all(['Изменение А', 'Изменение Б'].map(name => context.app.inject({ method: 'PUT', url: '/api/v1/profile', headers, payload: { value: { ...profile, name }, revision: 1 } })))
  expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409])
  const saved = await context.app.inject({ url: '/api/v1/profile', headers })
  expect(saved.json<unknown>()).toEqual(responses.find(response => response.statusCode === 200)?.json<unknown>())
  expect((await context.database.pool.query('SELECT revision::text FROM health.profiles')).rows).toEqual([{ revision: '2' }])
})

it('не раскрывает профиль другому владельцу или без входа', async () => {
  await create()
  expect((await context.app.inject({ url: '/api/v1/profile' })).statusCode).toBe(401)
  const bob = await context.headers('bob')
  expect((await context.app.inject({ url: '/api/v1/profile', headers: bob })).json<unknown>()).toBeNull()
  expect((await context.app.inject({ method: 'PUT', url: '/api/v1/profile', headers: bob, payload: { value: profile, revision: 1 } })).statusCode).toBe(404)
  expect((await context.app.inject({ method: 'PUT', url: '/api/v1/profile', headers: bob, payload: { value: profile, revision: 1, user_id: context.alice.id } })).statusCode).toBe(400)
})

it('не сохраняет неверный ввод и не разрешает рождение позже измерения', async () => {
  for (const payload of [{ profile: { ...profile, heightCm: 0 }, weight }, { profile, weight: { ...weight, date: '2026-10-16' } }, { profile: { ...profile, birthDate: '2026-10-15' }, weight: { ...weight, date: '2026-10-14' } }]) {
    const response = await context.app.inject({ method: 'POST', url: '/api/v1/profile', headers, payload })
    expect(response.statusCode).toBe(400)
  }
  expect((await context.database.pool.query('SELECT * FROM health.profiles')).rowCount).toBe(0)
  await context.app.inject({ method: 'POST', url: '/api/v1/profile', headers, payload: { profile, weight: { ...weight, date: '2026-10-10' } } })
  const response = await context.app.inject({ method: 'PUT', url: '/api/v1/profile', headers, payload: { value: { ...profile, birthDate: '2026-10-11' }, revision: 1 } })
  expect(response.statusCode).toBe(400)
})

it('сбой вставки веса откатывает профиль без раскрытия SQL-ошибки', async () => {
  await context.database.pool.query(`CREATE FUNCTION health.reject_weight() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic private failure'; END $$;
    CREATE TRIGGER reject_weight BEFORE INSERT ON health.weights FOR EACH ROW EXECUTE FUNCTION health.reject_weight();`)
  const response = await create()
  expect(response.statusCode).toBe(500)
  expect(response.body).not.toContain('synthetic private failure')
  expect((await context.database.pool.query('SELECT * FROM health.profiles')).rowCount).toBe(0)
})

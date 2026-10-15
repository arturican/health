// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { seedDemo } from './seedRecords'
import { withUser } from './userTransaction'
import { readFullSnapshot } from './fullSnapshot'
import { demoBackup } from './demoBackup'
import { accountSchema } from './accounts'

let context: Awaited<ReturnType<typeof testApi>>
const input = { login: 'demo', password: 'synthetic-demo-password', timezone: 'Europe/Moscow' }
beforeEach(async () => { context = await testApi(() => {}) })
afterEach(async () => { await context.close() })
const seed = (values: unknown = input, now = context.now) => seedDemo(context.database.pool, context.database.runtime, values, now)

it('загружает все области, сохраняет пароль и правки при повторе, изолирует второго владельца', async () => {
  await withUser(context.database.runtime, context.bob, client => client.query('INSERT INTO health.steps(user_id,date,count) VALUES ($1,$2,77)', [context.bob.id, '2026-10-15']), true)
  const result = await seed()
  expect(result.seeded).toBe(true)
  const snapshot = () => withUser(context.database.runtime, result.account, client => readFullSnapshot(client, '2026-10-15', '2026-10-15T12:00:00.000Z'))
  const expected = await demoBackup('2026-10-15'), actual = await snapshot()
  const sorted = (rows: readonly ({ id: string } | { date: string })[]) => rows.toSorted((a, b) =>
    ('id' in a ? a.id : a.date).localeCompare('id' in b ? b.id : b.date))
  for (const key of ['weights', 'products', 'foodEntries', 'nutritionDays', 'steps', 'workouts', 'energyPlans'] as const) {
    expect(sorted(actual.text[key])).toEqual(sorted(expected.text[key]))
  }
  expect(actual.files).toEqual(expect.arrayContaining(expected.files))
  expect(actual.files).toHaveLength(6)
  expect(actual.labResults).toHaveLength(9)
  await withUser(context.database.runtime, result.account, client => client.query('UPDATE health.profiles SET name=$1', ['Сохранённая учебная правка']), true)
  const before = await snapshot()
  expect((await seed({ ...input, password: 'different-synthetic-password' }, new Date('2026-10-16T12:00:00Z'))).seeded).toBe(false)
  expect((await seed({ login: input.login, timezone: input.timezone })).seeded).toBe(false)
  expect(await snapshot()).toEqual(before)
  const login = (password: string) => context.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://health.example.test' }, payload: { login: input.login, password } })
  expect((await login(input.password)).statusCode).toBe(200)
  expect((await login('different-synthetic-password')).statusCode).toBe(401)
  expect((await context.database.pool.query('SELECT count FROM health.steps WHERE user_id=$1', [context.bob.id])).rows).toEqual([{ count: 77 }])
  expect((await context.database.pool.query('SELECT id FROM health.users WHERE login=$1', [input.login])).rowCount).toBe(1)
  expect((await context.database.runtime.query('SELECT id FROM health.files')).rowCount).toBe(0)
})

it('конкурентные запуски создают один аккаунт и один набор', async () => {
  const results = await Promise.all([seed(), seed()])
  expect(results.map(result => result.seeded).sort()).toEqual([false, true])
  expect(results[0].account).toEqual(results[1].account)
  expect((await context.database.pool.query('SELECT id FROM health.photos')).rowCount).toBe(3)
  expect((await context.database.pool.query('SELECT id FROM health.legacy_metadata WHERE id=$1', ['demo-seed-v1'])).rowCount).toBe(1)
})

it('отказывает на непустом дневнике, несовпадающем часовом поясе и привилегированной runtime-роли', async () => {
  await context.headers()
  await context.database.pool.query('UPDATE health.settings SET visibility_defined=true WHERE user_id=$1', [context.alice.id])
  await expect(seed({ ...input, login: 'alice' })).rejects.toMatchObject({ statusCode: 409 })
  await expect(seed({ ...input, login: 'alice', timezone: 'UTC' })).rejects.toThrow('Часовой пояс')
  await expect(seedDemo(context.database.pool, context.database.pool, input, context.now)).rejects.toThrow('ограниченную роль')
  await expect(seed({ ...input, password: 'short' })).rejects.toThrow()
  expect((await context.database.pool.query('SELECT id FROM health.users')).rowCount).toBe(2)
  expect((await context.database.pool.query('SELECT user_id FROM health.profiles')).rowCount).toBe(0)
  expect((await context.database.pool.query('SELECT visibility_defined FROM health.settings WHERE user_id=$1', [context.alice.id])).rows).toEqual([{ visibility_defined: true }])
})

it('сбой поздней вставки не оставляет частичной демонстрации, повтор использует прежний аккаунт', async () => {
  await context.database.pool.query(`CREATE FUNCTION health.reject_seed() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic seed failure'; END $$;
    CREATE TRIGGER reject_seed BEFORE INSERT ON health.lab_results FOR EACH ROW EXECUTE FUNCTION health.reject_seed();`)
  await expect(seed()).rejects.toThrow('synthetic seed failure')
  const rows = await context.database.pool.query<Record<string, unknown>>('SELECT id,login,timezone FROM health.users WHERE login=$1', [input.login])
  const account = accountSchema.parse(rows.rows[0])
  for (const table of ['profiles', 'files', 'legacy_metadata', 'settings']) {
    expect((await context.database.pool.query(`SELECT user_id FROM health.${table} WHERE user_id=$1`, [account.id])).rowCount).toBe(0)
  }
  await context.database.pool.query('DROP TRIGGER reject_seed ON health.lab_results')
  expect(await seed()).toEqual({ account, seeded: true })
})

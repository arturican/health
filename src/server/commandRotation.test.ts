// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { registerSettings } from './settingsRoutes'
import { registerPlans } from './planRoutes'
import { registerClear } from './clearRoutes'
import { DEFAULT_VISIBILITY } from '../domain/visibility'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    registerSettings(app, pool, authorize)
    registerPlans(app, pool, authorize, clock)
    registerClear(app, pool, authorize)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const seed = (count: number) => context.database.pool.query("INSERT INTO health.commands(user_id,id,request_hash,response) SELECT $1,gen_random_uuid(),repeat('0',64),'null'::jsonb FROM generate_series(1,$2::int)", [context.alice.id, count])
const count = async () => (await context.database.pool.query<{ count: number }>('SELECT count(*)::int AS count FROM health.commands WHERE user_id=$1', [context.alice.id])).rows[0]?.count
const state = async () => (await context.app.inject({ url: '/api/v1/diary-state', headers })).json<Record<string, unknown>>()
const save = (revision = 1) => context.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { value: { ...DEFAULT_VISIBILITY, showPhotos: false }, revision } })
const createPlan = (id = randomUUID()) => context.app.inject({ method: 'POST', url: '/api/v1/energy-plans', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { id, expectedRevision: null, value: { effectiveFrom: '2026-10-15', goalKcal: 2000, method: 'none', manualKcal: null, factor: null, source: '' } } })

it.each([89998, 89999])('nested на persisted%s не застревает после rollback, следующая новая команда ротирует', async initial => {
  await seed(initial)
  expect((await createPlan()).statusCode).toBe(201)
  expect(await count()).toBe(initial + 2)
  const plans = await context.database.pool.query('SELECT * FROM health.energy_plans')
  const before = await state()
  const rotated = await save()
  expect(rotated.statusCode).toBe(409)
  expect(rotated.json<unknown>()).toMatchObject({ error: { code: 'command_rotation' } })
  expect(await count()).toBe(0)
  const after = await state()
  expect(after['generation']).not.toBe(before['generation'])
  expect({ ...after, generation: before['generation'] }).toEqual(before)
  expect((await context.database.pool.query('SELECT * FROM health.energy_plans')).rows).toEqual(plans.rows)
  headers = await context.headers()
  expect((await save()).statusCode).toBe(200)
})

it('конкурентные новые запросы ротируют ровно один раз без business writes', async () => {
  await seed(90000)
  const before = await state()
  const responses = await Promise.all([save(), save(), save()])
  expect(responses.map(response => response.statusCode)).toEqual([409, 409, 409])
  expect(responses.filter(response => response.json<{ error: { code: string } }>().error.code === 'command_rotation')).toHaveLength(1)
  expect(await count()).toBe(0)
  const after = await state()
  expect(after['generation']).not.toBe(before['generation'])
  expect({ ...after, generation: before['generation'] }).toEqual(before)
})

it('сбой generation UPDATE откатывает DELETE команд, повтор после исправления безопасен', async () => {
  await seed(90000)
  const before = await state()
  await context.database.pool.query("CREATE FUNCTION health.synthetic_rotation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-only'; END $$; CREATE TRIGGER synthetic_rotation_failure BEFORE UPDATE ON health.settings FOR EACH ROW WHEN (NEW.generation IS DISTINCT FROM OLD.generation) EXECUTE FUNCTION health.synthetic_rotation_failure()")
  expect((await save()).statusCode).toBe(500)
  expect(await count()).toBe(90000)
  expect(await state()).toEqual(before)
  await context.database.pool.query('DROP TRIGGER synthetic_rotation_failure ON health.settings')
  expect((await save()).json<unknown>()).toMatchObject({ error: { code: 'command_rotation' } })
  expect(await count()).toBe(0)
})

it('невалидная ревизия не инициирует обслуживание', async () => {
  await seed(90000)
  const before = await state()
  expect((await save(2)).statusCode).toBe(409)
  expect(await count()).toBe(90000)
  expect(await state()).toEqual(before)
})

it('nested hard100000 откатывается и обслуживается без создания плана', async () => {
  await seed(100000)
  const id = randomUUID()
  expect((await createPlan(id)).json<unknown>()).toMatchObject({ error: { code: 'command_rotation' } })
  expect((await context.database.pool.query('SELECT * FROM health.energy_plans')).rowCount).toBe(0)
  expect(await count()).toBe(0)
  expect((await createPlan(id)).statusCode).toBe(409)
  expect(await count()).toBe(0)
  headers = await context.headers()
  expect((await createPlan(id)).statusCode).toBe(201)
})

it('новый clear при пороге откатывается, ротация сохраняет план и revisions', async () => {
  expect((await createPlan()).statusCode).toBe(201)
  await seed(90000)
  const plans = await context.database.pool.query('SELECT * FROM health.energy_plans')
  const before = await state()
  const response = await context.app.inject({ method: 'DELETE', url: '/api/v1/diary', headers: { ...headers, 'idempotency-key': randomUUID(), 'x-diary-revision': String(before['changeRevision']) }, payload: { confirm: 'delete-diary' } })
  expect(response.statusCode).toBe(409)
  expect(response.json<unknown>()).toMatchObject({ error: { code: 'command_rotation' } })
  const after = await state()
  expect(after['generation']).not.toBe(before['generation'])
  expect({ ...after, generation: before['generation'] }).toEqual(before)
  expect((await context.database.pool.query('SELECT * FROM health.energy_plans')).rows).toEqual(plans.rows)
  expect(await count()).toBe(0)
})

it('без необязательного outer key действует тот же pre-work threshold', async () => {
  await seed(90000)
  const response = await context.app.inject({ method: 'PUT', url: '/api/v1/settings', headers, payload: { value: DEFAULT_VISIBILITY, revision: 1 } })
  expect(response.statusCode).toBe(409)
  expect(response.json<unknown>()).toMatchObject({ error: { code: 'command_rotation' } })
  expect(await count()).toBe(0)
})

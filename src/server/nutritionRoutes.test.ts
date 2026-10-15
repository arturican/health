// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerNutrition } from './nutritionRoutes'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const day = '2026-10-15'
const command = { commandId: randomUUID(), source: '2026-10-14', target: day, meal: 'breakfast' }
beforeEach(async () => {
  context = await testApi(registerNutrition)
  headers = await context.headers()
  await context.database.pool.query(`INSERT INTO health.food_entries(user_id,id,date,meal,name,source,kcal,protein,fat,carbs,grams,note)
    VALUES ($1,$2,'2026-10-14','breakfast','Учебная порция','Синтетические данные',100,NULL,0,25,123.456789,'Исходная заметка')`, [context.alice.id, randomUUID()])
})
afterEach(async () => { await context.close() })
const get = (ownHeaders = headers) => context.app.inject({ url: `/api/v1/nutrition-days/${day}`, headers: ownHeaders })
const put = (complete: boolean, revision: number | null = null, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/nutrition-days/${day}`, headers: ownHeaders, payload: { value: { date: day, complete }, revision } })
const copy = (payload: Record<string, unknown> = command, ownHeaders = headers) => context.app.inject({ method: 'POST', url: '/api/v1/food/copy', headers: ownHeaders, payload })

it('отличает отсутствие отметки от false и true и сохраняет после повторного входа', async () => {
  expect((await get()).json<unknown>()).toBeNull()
  expect((await put(false)).json<unknown>()).toEqual({ value: { date: day, complete: false }, revision: 1 })
  expect((await put(true, 1)).json<unknown>()).toEqual({ value: { date: day, complete: true }, revision: 2 })
  expect((await put(false, 1)).statusCode).toBe(409)
  headers = await context.headers()
  expect((await get()).json<unknown>()).toEqual({ value: { date: day, complete: true }, revision: 2 })
})

it('проверяет дату/владение и конкурентное создание полноты дня', async () => {
  const results = await Promise.all([put(false), put(true)])
  expect(results.map(result => result.statusCode).sort()).toEqual([200, 409])
  const bob = await context.headers('bob')
  expect((await get(bob)).json<unknown>()).toBeNull()
  expect((await put(true, 1, bob)).statusCode).toBe(409)
  expect((await context.app.inject({ url: `/api/v1/nutrition-days/${day}` })).statusCode).toBe(401)
  for (const date of ['invalid', '2026-10-16']) {
    expect((await context.app.inject({ method: 'PUT', url: `/api/v1/nutrition-days/${date}`, headers, payload: { value: { date, complete: true }, revision: null } })).statusCode).toBe(400)
  }
})

it('копирует снимок ровно один раз при конкурентном повторе и отклоняет замену параметров', async () => {
  const responses = await Promise.all([copy(), copy()])
  expect(responses.map(response => response.statusCode)).toEqual([200, 200])
  for (const response of responses) expect(response.json<unknown>()).toEqual({ count: 1 })
  expect((await context.database.pool.query('SELECT count(*)::text FROM health.food_entries')).rows).toEqual([{ count: '2' }])
  const rows = await context.database.pool.query(`SELECT name,source,kcal::text,protein::text,fat::text,carbs::text,grams::text,note FROM health.food_entries ORDER BY date`)
  expect(rows.rows[1]).toEqual(rows.rows[0])
  expect((await copy({ ...command, target: '2026-10-13' })).statusCode).toBe(409)
  expect((await get()).json<unknown>()).toBeNull()
  headers = await context.headers()
  expect((await copy()).json<unknown>()).toEqual({ count: 1 })
})

it('пустой/чужой источник и неверные параметры не создают команду', async () => {
  const bob = await context.headers('bob')
  expect((await copy(command, bob)).statusCode).toBe(400)
  for (const patch of [{ source: '2026-10-13' }, { source: day }, { target: '2026-10-16' }, { commandId: 'invalid' }, { meal: 'other' }, { user_id: context.bob.id }]) {
    expect((await copy({ ...command, ...patch })).statusCode).toBe(400)
  }
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(0)
  expect((await context.database.pool.query('SELECT * FROM health.food_entries')).rowCount).toBe(1)
})

it('отказ фиксации команды откатывает порции, после устранения причины повтор работает', async () => {
  await context.database.pool.query(`CREATE FUNCTION health.reject_command() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic command failure'; END $$;
    CREATE TRIGGER reject_command BEFORE INSERT ON health.commands FOR EACH ROW EXECUTE FUNCTION health.reject_command();`)
  const result = await copy()
  expect(result.statusCode).toBe(500)
  expect(result.body).not.toContain('synthetic command failure')
  expect((await context.database.pool.query('SELECT * FROM health.food_entries')).rowCount).toBe(1)
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(0)
  await context.database.pool.query('DROP TRIGGER reject_command ON health.commands')
  expect((await copy()).statusCode).toBe(200)
})

it('результат команды изолирован по владельцу и удаляется вместе с аккаунтом', async () => {
  await copy()
  const bob = await context.headers('bob')
  expect((await copy(command, bob)).statusCode).toBe(400)
  expect((await context.database.runtime.query('SELECT * FROM health.commands')).rowCount).toBe(0)
  await context.database.pool.query('DELETE FROM health.users WHERE id=$1', [context.alice.id])
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(0)
})

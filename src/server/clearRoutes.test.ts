// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { testApi } from '../../tests/serverApi'
import { fullBackupFixture } from '../../tests/fullBackupFixture'
import { registerClear } from './clearRoutes'
import { registerBackups } from './backupRoutes'
import { registerSettings } from './settingsRoutes'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    registerClear(app, pool, authorize); registerBackups(app, pool, authorize, clock); registerSettings(app, pool, authorize)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const state = async (ownHeaders = headers) => z.object({ generation: z.uuid(), changeRevision: z.number(), revision: z.number() })
  .parse((await context.app.inject({ url: '/api/v1/diary-state', headers: ownHeaders })).json<unknown>())
async function confirmed(ownHeaders = headers) {
  const current = await state(ownHeaders)
  return { ...ownHeaders, 'x-diary-generation': current.generation, 'x-diary-revision': String(current.changeRevision), 'idempotency-key': randomUUID() }
}
async function fill(ownHeaders = headers) {
  const response = await context.app.inject({ method: 'POST', url: '/api/v1/backup/full',
    headers: { ...await confirmed(ownHeaders), 'content-type': 'application/vnd.health-diary+json' }, payload: Buffer.from(JSON.stringify(await fullBackupFixture())) })
  expect(response.statusCode).toBe(200)
}
const clear = (ownHeaders: Record<string, string>, payload: unknown = { confirm: 'delete-diary' }) => context.app.inject({
  method: 'DELETE', url: '/api/v1/diary', headers: ownHeaders, payload: JSON.stringify(payload),
})
const clearHeaders = async () => ({ ...await confirmed(), 'content-type': 'application/json' })
const download = (ownHeaders = headers) => context.app.inject({ url: '/api/v1/backup/full', headers: ownHeaders })

it('очищает все области одного владельца, сохраняет вход и допускает повтор', async () => {
  const empty = (await download()).json<unknown>()
  await fill()
  const bob = await context.headers('bob')
  await fill(bob)
  const bobBefore = (await download(bob)).json<unknown>()
  const confirmation = await clearHeaders()
  const first = await clear(confirmation)
  expect(first.statusCode).toBe(200)
  expect((await clear(confirmation)).json<unknown>()).toEqual(first.json<unknown>())
  expect((await download()).json<unknown>()).toEqual(empty)
  expect((await download(bob)).json<unknown>()).toEqual(bobBefore)
  expect((await state()).generation).not.toBe(confirmation['x-diary-generation'])
  expect((await state()).changeRevision).toBe(2)
  expect((await context.app.inject({ url: '/api/v1/auth/session', headers })).statusCode).toBe(200)
  const commands = await context.database.pool.query('SELECT id FROM health.commands WHERE user_id=$1', [context.alice.id])
  expect(commands.rows).toEqual([{ id: confirmation['idempotency-key'] }])
  expect((await clear(await clearHeaders())).statusCode).toBe(200)
})

it('отклоняет старое подтверждение и запись из предыдущего поколения', async () => {
  await fill()
  const confirmation = await clearHeaders()
  const before = await state()
  const edit = () => context.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { ...headers, 'x-diary-generation': before.generation },
    payload: { value: { version: 1, showPhotos: true, showDocuments: true }, revision: before.revision } })
  expect((await edit()).statusCode).toBe(200)
  expect((await clear(confirmation)).statusCode).toBe(409)
  expect((await clear(await clearHeaders())).statusCode).toBe(200)
  expect((await edit()).statusCode).toBe(409)
})

it('требует авторизацию, полное подтверждение и точный JSON', async () => {
  await fill()
  const before = (await download()).json<unknown>()
  const confirmation = await clearHeaders()
  for (const field of ['x-diary-generation', 'x-diary-revision', 'idempotency-key']) {
    const missing = Object.fromEntries(Object.entries(confirmation).filter(([key]) => key !== field))
    expect((await clear(missing)).statusCode).toBe(400)
  }
  for (const payload of [{}, { confirm: true }, { confirm: 'delete-diary', userId: context.bob.id }]) {
    expect((await clear(confirmation, payload)).statusCode).toBe(400)
  }
  expect((await clear({ origin: headers.origin, 'content-type': 'application/json' })).statusCode).toBe(401)
  expect((await clear({ ...confirmation, origin: 'https://other.example.test' })).statusCode).toBe(403)
  expect((await clear({ ...confirmation, 'x-csrf-token': 'wrong' })).statusCode).toBe(403)
  expect((await download()).json<unknown>()).toEqual(before)
})

it('ошибка после удаления файлов откатывает весь дневник и позволяет повторить', async () => {
  await fill()
  const before = (await download()).json<unknown>(), oldState = await state(), confirmation = await clearHeaders()
  await context.database.pool.query(`CREATE FUNCTION health.reject_clear() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic clear failure'; END $$;
    CREATE TRIGGER reject_clear BEFORE DELETE ON health.energy_plans FOR EACH ROW EXECUTE FUNCTION health.reject_clear();`)
  expect((await clear(confirmation)).statusCode).toBe(500)
  expect((await download()).json<unknown>()).toEqual(before)
  expect(await state()).toEqual(oldState)
  await context.database.pool.query('DROP TRIGGER reject_clear ON health.energy_plans')
  expect((await clear(confirmation)).statusCode).toBe(200)
})

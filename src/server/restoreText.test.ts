// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { testApi } from '../../tests/serverApi'
import { textBackupFixture } from '../../tests/textBackupFixture'
import { TEXT_BACKUP_MAX_BYTES } from '../domain/backup'
import { readFullBackup } from '../domain/fullBackup'
import { registerBackups } from './backupRoutes'
import { registerSettings } from './settingsRoutes'
import { registerDocuments } from './documentRoutes'
import { createUploadTransport } from './uploadTransport'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    registerBackups(app, pool, authorize, clock)
    registerSettings(app, pool, authorize)
    registerDocuments(app, pool, authorize, createUploadTransport(app, authorize), clock)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
async function confirmation(mode = 'empty', ownHeaders = headers) {
  const state = z.object({ generation: z.uuid(), changeRevision: z.number() }).parse((await context.app.inject({ url: '/api/v1/diary-state', headers: ownHeaders })).json<unknown>())
  return { ...ownHeaders, 'x-diary-generation': state.generation, 'x-diary-revision': String(state.changeRevision),
    'idempotency-key': randomUUID(), 'x-import-mode': mode, 'content-type': 'application/vnd.health-diary+json' }
}
const restore = (ownHeaders: Record<string, string>, input: unknown = textBackupFixture()) => context.app.inject({ method: 'POST', url: '/api/v1/backup/text', headers: ownHeaders, payload: Buffer.from(JSON.stringify(input)) })
const download = (ownHeaders = headers) => context.app.inject({ url: '/api/v1/backup/text', headers: ownHeaders })

it('восстанавливает все текстовые области, повторяется без дублей и изолирует одинаковые UUID', async () => {
  const confirmed = await confirmation()
  const first = await restore(confirmed)
  expect(first.statusCode).toBe(200)
  expect((await restore(confirmed)).json<unknown>()).toEqual(first.json<unknown>())
  expect((await download()).json<unknown>()).toEqual(textBackupFixture())
  expect((await context.app.inject({ url: '/api/v1/diary-state', headers })).json<unknown>()).toMatchObject({ changeRevision: 1 })
  expect((await restore(await confirmation())).statusCode).toBe(409)
  const bob = await context.headers('bob')
  expect((await restore(await confirmation('empty', bob))).statusCode).toBe(200)
  expect((await download(bob)).json<unknown>()).toEqual(textBackupFixture())
  expect((await context.database.pool.query('SELECT count(*)::int AS count FROM health.weights')).rows).toEqual([{ count: 4 }])
})

it('заменяет текст только с актуальным подтверждением, сохраняя файлы и видимость', async () => {
  await restore(await confirmation())
  headers = await context.headers()
  const stale = await confirmation('replace')
  const visibility = { version: 1, showPhotos: false, showDocuments: false }
  await context.app.inject({ method: 'PUT', url: '/api/v1/settings', headers, payload: { value: visibility, revision: 1 } })
  expect((await restore(stale)).statusCode).toBe(409)
  const pdf = Buffer.from('%PDF-1.7\n% Synthetic report\n%%EOF\n')
  const document = { id: randomUUID(), fileId: randomUUID(), date: '2026-10-15', title: 'Сохраняемый учебный бланк', kind: 'lab', note: '', mime: 'application/pdf' }
  expect((await context.app.inject({ method: 'POST', url: '/api/v1/documents', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-record': Buffer.from(JSON.stringify(document)).toString('base64url') }, payload: pdf })).statusCode).toBe(201)
  await context.database.pool.query('UPDATE health.settings SET catalog_seeded=true WHERE user_id=$1', [context.alice.id])
  const backup = textBackupFixture()
  if (!backup.profile) throw new Error('Нет учебного профиля')
  backup.profile.name = 'Обновлённый учебный профиль'
  expect((await restore(await confirmation('replace'), backup)).statusCode).toBe(200)
  expect((await download()).json<unknown>()).toEqual(backup)
  const full = readFullBackup((await context.app.inject({ url: '/api/v1/backup/full', headers })).json<unknown>(), '2026-10-15')
  expect(full.files[0]?.base64).toBe(pdf.toString('base64'))
  expect(full.metadata.some(row => row.id === 'catalog-seeded')).toBe(false)
  expect(full.metadata.find(row => row.id === 'section-visibility')?.value).toContain('false')
})

it('ошибка середины вставки откатывает удаление, версию и generation; тот же запрос можно повторить', async () => {
  await restore(await confirmation())
  const confirmed = await confirmation('replace')
  await context.database.pool.query(`CREATE FUNCTION health.reject_steps() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic import failure'; END $$;
    CREATE TRIGGER reject_steps BEFORE INSERT ON health.steps FOR EACH ROW EXECUTE FUNCTION health.reject_steps();`)
  const response = await restore(confirmed)
  expect(response.statusCode).toBe(500)
  expect(response.body).not.toContain('synthetic import failure')
  expect((await download()).json<unknown>()).toEqual(textBackupFixture())
  expect((await context.app.inject({ url: '/api/v1/diary-state', headers })).json<unknown>()).toMatchObject({ generation: confirmed['x-diary-generation'], changeRevision: 1 })
  await context.database.pool.query('DROP TRIGGER reject_steps ON health.steps')
  expect((await restore(confirmed)).statusCode).toBe(200)
})

it('проверяет заголовки до тела, ограничивает размер и отвергает неверный JSON/связи', async () => {
  const confirmed = await confirmation()
  const oversized = Buffer.alloc(TEXT_BACKUP_MAX_BYTES + 1, 32)
  const send = (payload: Buffer, ownHeaders: Record<string, string> = confirmed) => context.app.inject({ method: 'POST', url: '/api/v1/backup/text', headers: ownHeaders, payload })
  expect((await send(oversized, { 'content-type': confirmed['content-type'] })).statusCode).toBe(403)
  expect((await send(oversized, { origin: confirmed.origin, 'content-type': confirmed['content-type'] })).statusCode).toBe(401)
  expect((await send(oversized, { ...confirmed, 'idempotency-key': '' })).statusCode).toBe(400)
  expect((await send(oversized)).statusCode).toBe(413)
  for (const bytes of [Buffer.from('{'), Buffer.from([0xff])]) expect((await send(bytes)).statusCode).toBe(400)
  expect((await restore(confirmed, { ...textBackupFixture(), profile: null })).statusCode).toBe(400)
  expect((await restore(confirmed, { ...textBackupFixture(), user_id: context.bob.id })).statusCode).toBe(400)
  expect((await restore({ ...confirmed, 'x-import-mode': 'merge' })).statusCode).toBe(400)
  expect((await context.database.pool.query('SELECT * FROM health.profiles')).rowCount).toBe(0)
  expect((await restore(confirmed)).statusCode).toBe(200)
})

it('после ротации заполненного журнала импорт требует свежего подтверждения и сохраняет replay', async () => {
  const original = await confirmation()
  const first = await restore(original)
  expect(first.statusCode).toBe(200)
  await context.database.pool.query(`INSERT INTO health.commands(user_id,id,request_hash,response)
    SELECT $1,gen_random_uuid(),repeat('0',64),'{}'::jsonb FROM generate_series(1,99999)`, [context.alice.id])
  expect((await restore(original)).json<unknown>()).toEqual(first.json<unknown>())
  const before = (await download()).json<unknown>()
  const confirmed = await confirmation('replace')
  const rotated = await restore(confirmed)
  expect(rotated.statusCode).toBe(409)
  expect(rotated.json<unknown>()).toMatchObject({ error: { code: 'command_rotation' } })
  expect((await download()).json<unknown>()).toEqual(before)
  expect((await context.database.pool.query('SELECT id FROM health.commands')).rows).toEqual([])
  expect((await restore(confirmed)).statusCode).toBe(409)
  const fresh = await confirmation('replace')
  const imported = await restore(fresh)
  expect(imported.statusCode).toBe(200)
  expect((await restore(fresh)).json<unknown>()).toEqual(imported.json<unknown>())
  expect((await context.database.pool.query('SELECT id FROM health.commands')).rows).toEqual([{ id: fresh['idempotency-key'] }])
}, 15000)

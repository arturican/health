// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { testApi } from '../../tests/serverApi'
import { fullBackupFixture } from '../../tests/fullBackupFixture'
import { FULL_BACKUP_MAX_BYTES, readFullBackup, type FullBackup } from '../domain/fullBackup'
import { readVisibilityValue } from '../domain/visibility'
import { registerBackups } from './backupRoutes'
import { registerSettings } from './settingsRoutes'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { DEFAULT_VISIBILITY } from '../domain/visibility'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => { registerBackups(app, pool, authorize, clock); registerSettings(app, pool, authorize) })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
async function confirmation(mode = 'empty', ownHeaders = headers) {
  const state = z.object({ generation: z.uuid(), changeRevision: z.number() }).parse((await context.app.inject({ url: '/api/v1/diary-state', headers: ownHeaders })).json<unknown>())
  return { ...ownHeaders, 'x-diary-generation': state.generation, 'x-diary-revision': String(state.changeRevision),
    'idempotency-key': randomUUID(), 'x-import-mode': mode, 'content-type': 'application/vnd.health-diary+json' }
}
const restore = (ownHeaders: Record<string, string>, input: unknown) => context.app.inject({ method: 'POST', url: '/api/v1/backup/full', headers: ownHeaders, payload: Buffer.from(JSON.stringify(input)) })
async function download(ownHeaders = headers) {
  const response = await context.app.inject({ url: '/api/v1/backup/full', headers: ownHeaders })
  expect(response.statusCode).toBe(200)
  return readFullBackup(response.json<unknown>(), '2026-10-15')
}
function canonical(backup: FullBackup) {
  return { ...backup, metadata: backup.metadata.filter(row => row.id !== 'diary-generation')
    .map(row => row.id === 'section-visibility' ? { ...row, value: JSON.stringify(readVisibilityValue(row.value)) } : row)
    .sort((a, b) => a.id.localeCompare(b.id)) }
}

it('сохраняет возможность экспорта после импорта предельного числа метаданных', async () => {
  const backup = await download()
  backup.metadata = Array.from({ length: BACKUP_MAX_RECORDS }, (_, index) => ({ id: `legacy-${String(index)}`, value: 'synthetic' }))
  const imported = await restore(await confirmation(), backup)
  expect(imported.statusCode).toBe(200)
  const generation = z.object({ generation: z.uuid() }).parse(imported.json<unknown>()).generation
  const save = (revision: number) => context.app.inject({ method: 'PUT', url: '/api/v1/settings',
    headers: { ...headers, 'x-diary-generation': generation }, payload: { value: DEFAULT_VISIBILITY, revision } })
  expect((await save(2)).statusCode).toBe(400)
  expect((await download()).metadata).toHaveLength(BACKUP_MAX_RECORDS)
  expect((await context.app.inject({ url: '/api/v1/diary-state', headers })).json<unknown>()).toMatchObject({ revision: 2, changeRevision: 1 })
  await context.database.pool.query('DELETE FROM health.legacy_metadata WHERE user_id=$1 AND id=$2', [context.alice.id, 'legacy-0'])
  expect((await save(2)).statusCode).toBe(200)
  expect((await save(3)).statusCode).toBe(200)
  expect((await download()).metadata).toHaveLength(BACKUP_MAX_RECORDS)
})

it('полностью восстанавливает байты и связи, повторяется и сохраняет чужие одинаковые UUID', async () => {
  const backup = await fullBackupFixture(), confirmed = await confirmation()
  const first = await restore(confirmed, backup)
  expect(first.statusCode).toBe(200)
  expect((await restore(confirmed, backup)).json<unknown>()).toEqual(first.json<unknown>())
  expect(canonical(await download())).toEqual(canonical(backup))
  const generation = z.object({ generation: z.uuid() }).parse(first.json<unknown>()).generation
  expect(generation).not.toBe(confirmed['x-diary-generation'])
  expect(generation).not.toBe(backup.metadata.find(row => row.id === 'diary-generation')?.value)
  expect((await restore(await confirmation(), backup)).statusCode).toBe(409)
  const bob = await context.headers('bob')
  expect((await restore(await confirmation('empty', bob), backup)).statusCode).toBe(200)
  const changed = { ...backup, photos: [], files: backup.files.filter(file => file.purpose !== 'photo') }
  expect((await restore(confirmed, changed)).statusCode).toBe(409)
  expect((await restore(await confirmation('replace'), changed)).statusCode).toBe(200)
  expect(canonical(await download())).toEqual(canonical(changed))
  expect(canonical(await download(bob))).toEqual(canonical(backup))
  expect((await context.database.pool.query('SELECT * FROM health.files')).rowCount).toBe(3)
})

it('сбой поздней вставки откатывает удаление старых файлов, текст, метаданные и generation', async () => {
  const backup = await fullBackupFixture()
  await restore(await confirmation(), backup)
  const confirmed = await confirmation('replace')
  const changed = structuredClone(backup)
  if (!changed.text.profile) throw new Error('Нет учебного профиля')
  changed.text.profile.name = 'Новая учебная версия'
  await context.database.pool.query(`CREATE FUNCTION health.reject_lab() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic full import failure'; END $$;
    CREATE TRIGGER reject_lab BEFORE INSERT ON health.lab_results FOR EACH ROW EXECUTE FUNCTION health.reject_lab();`)
  expect((await restore(confirmed, changed)).statusCode).toBe(500)
  expect(canonical(await download())).toEqual(canonical(backup))
  expect((await context.app.inject({ url: '/api/v1/diary-state', headers })).json<unknown>()).toMatchObject({ generation: confirmed['x-diary-generation'], changeRevision: 1 })
  await context.database.pool.query('DROP TRIGGER reject_lab ON health.lab_results')
  expect((await restore(confirmed, changed)).statusCode).toBe(200)
  expect(canonical(await download())).toEqual(canonical(changed))
})

it('не изменяет дневник при повреждённом файле и ограничивает тело до разбора', async () => {
  const backup = await fullBackupFixture()
  await restore(await confirmation(), backup)
  const confirmed = await confirmation('replace')
  const damaged = { ...backup, files: backup.files.map(file => ({ ...file, base64: Buffer.alloc(file.size, 1).toString('base64') })) }
  expect((await restore(confirmed, damaged)).statusCode).toBe(400)
  expect(canonical(await download())).toEqual(canonical(backup))
  const response = await context.app.inject({ method: 'POST', url: '/api/v1/backup/full', headers: { ...confirmed, 'content-length': String(FULL_BACKUP_MAX_BYTES + 1) }, payload: Buffer.from('{}') })
  expect(response.statusCode).toBe(413)
  expect((await context.app.inject({ method: 'POST', url: '/api/v1/backup/full', headers: { origin: headers.origin, 'content-type': confirmed['content-type'] }, payload: Buffer.from('{') })).statusCode).toBe(401)
  expect((await restore({ ...confirmed, 'x-diary-revision': '0' }, backup)).statusCode).toBe(409)
  expect(canonical(await download())).toEqual(canonical(backup))
})

it('подтверждённая пустая копия очищает все области, но сохраняет аккаунт и сессию', async () => {
  const empty = await download()
  await restore(await confirmation(), await fullBackupFixture())
  expect((await restore(await confirmation('replace'), empty)).statusCode).toBe(200)
  expect(await download()).toEqual(empty)
  expect((await context.app.inject({ url: '/api/v1/auth/session', headers })).statusCode).toBe(200)
  expect((await context.database.pool.query('SELECT id FROM health.users')).rowCount).toBe(2)
})

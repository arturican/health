// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let db: Awaited<ReturnType<typeof testDatabase>>
const email = 'synthetic-zone@example.test', hash = '$argon2id$synthetic-only'
const first = 'a'.repeat(64), second = 'b'.repeat(64), third = 'c'.repeat(64)
const now = '2026-10-16T10:00:00Z', later = '2026-10-16T10:01:00Z'
beforeEach(async () => { db = await testDatabase(); await migrate(db.pool, (await readMigrations()).filter(m => m.name < '016')) })
afterEach(async () => { await db.close() })
const upgrade = async () => migrate(db.pool, await readMigrations())
const signup = (zone: string, digest = first, moment = now) => db.runtime.query(
  'SELECT * FROM health.begin_email_registration($1,$2,$3,$4,$5)', [email, zone, hash, digest, moment])
const issue = (digest = third, moment = '2026-10-16T10:02:00Z', purpose = 'verify_email') => db.runtime.query(
  'SELECT * FROM health.issue_account_token($1,$2,$3,$4)', [email, purpose, digest, moment])
const zone = async () => (await db.pool.query<{ timezone: string }>('SELECT timezone FROM health.users WHERE email=$1', [email])).rows[0]?.timezone
const complete = async (digest = first, moment = later, purpose = 'verify_email') => (await db.runtime.query<{ ok: boolean }>(
  'SELECT health.complete_account_token($1,$2,$3,$4) AS ok', [digest, purpose, hash, moment])).rows[0]?.ok

it('подтверждает timezone конкретной повторной регистрации, не меняя users до подтверждения', async () => {
  await upgrade()
  await signup('UTC')
  await signup('Europe/Moscow', second, later)
  expect(await zone()).toBe('UTC')
  expect(await complete(first)).toBe(false)
  expect(await complete(second)).toBe(true)
  expect(await zone()).toBe('Europe/Moscow')
})

it('cooldown не меняет timezone действующей ссылки', async () => {
  await upgrade()
  await signup('Europe/Moscow')
  expect((await signup('Asia/Tokyo', second, '2026-10-16T10:00:59Z')).rows).toEqual([])
  expect(await complete(first)).toBe(true)
  expect(await zone()).toBe('Europe/Moscow')
})

it('generic resend сохраняет выбранную token zone, а старая ссылка недействительна', async () => {
  await upgrade()
  await signup('UTC')
  await signup('Asia/Tokyo', second, later)
  await issue()
  expect(await complete(second, '2026-10-16T10:02:00Z')).toBe(false)
  expect(await complete(third, '2026-10-16T10:02:00Z')).toBe(true)
  expect(await zone()).toBe('Asia/Tokyo')
})

it('expiry, replay, анонимный verified signup и reset не меняют подтверждённый пояс', async () => {
  await upgrade()
  await signup('UTC')
  await signup('Asia/Tokyo', second, later)
  expect(await complete(second, '2026-10-16T11:01:00Z')).toBe(false)
  expect(await zone()).toBe('UTC')
  await issue()
  expect(await complete(third, '2026-10-16T10:02:00Z')).toBe(true)
  expect((await signup('Europe/Moscow', first, '2026-10-16T10:03:00Z')).rows).toEqual([])
  expect(await complete(third, '2026-10-16T10:03:00Z')).toBe(false)
  await issue(first, '2026-10-16T10:03:00Z', 'reset_password')
  expect(await complete(first, '2026-10-16T10:03:00Z', 'reset_password')).toBe(true)
  expect(await zone()).toBe('Asia/Tokyo')
})

it('гонка двух регистраций закрепляет пояс только за фактически выданной ссылкой', async () => {
  await upgrade()
  await signup('UTC')
  const choices = [{ zone: 'Asia/Tokyo', digest: second }, { zone: 'Pacific/Kiritimati', digest: third }]
  const results = await Promise.all(choices.map(choice => signup(choice.zone, choice.digest, later)))
  const winner = choices[results.findIndex(result => result.rows.length === 1)]
  expect(results.filter(result => result.rows.length === 1)).toHaveLength(1)
  if (!winner) throw new Error('Нет выданной синтетической ссылки')
  expect(await complete(winner.digest)).toBe(true)
  expect(await zone()).toBe(winner.zone)
})

it('анонимная регистрация не меняет пояс legacy аккаунта при подтверждении email', async () => {
  await upgrade()
  await db.pool.query("INSERT INTO health.users(id,login,password_hash,timezone,created_at,email) VALUES(gen_random_uuid(),'synthetic-legacy',$1,'UTC',$2,$3)", [hash, now, email])
  await signup('Asia/Tokyo')
  expect(await complete()).toBe(true)
  expect(await zone()).toBe('UTC')
})

it('upgrade сохраняет действующую ссылку015 и повторная миграция идемпотентна', async () => {
  await signup('UTC')
  expect(await upgrade()).toBe(1)
  expect(await upgrade()).toBe(0)
  expect(await complete()).toBe(true)
  expect(await zone()).toBe('UTC')
})

it('гонка signup с complete применяет пояс только подтверждённого токена', async () => {
  await upgrade()
  await signup('UTC')
  const [registered, confirmed] = await Promise.all([signup('Asia/Tokyo', second, later), complete(first)])
  if (confirmed) {
    expect(registered.rows).toEqual([])
    expect(await zone()).toBe('UTC')
    expect(await complete(second)).toBe(false)
  } else {
    expect(registered.rows).toHaveLength(1)
    expect(await complete(second)).toBe(true)
    expect(await zone()).toBe('Asia/Tokyo')
  }
})

it('новое поле закрыто от runtime, допускает только verify с ограниченной длиной', async () => {
  await upgrade()
  await signup('UTC')
  await expect(db.runtime.query('SELECT registration_timezone FROM health.account_tokens')).rejects.toMatchObject({ code: '42501' })
  for (const value of ['', 'x'.repeat(81)]) {
    await expect(db.pool.query('UPDATE health.account_tokens SET registration_timezone=$1', [value])).rejects.toMatchObject({ code: '23514' })
  }
  expect(await complete()).toBe(true)
  await issue(second, later, 'reset_password')
  await expect(db.pool.query("UPDATE health.account_tokens SET registration_timezone='UTC' WHERE purpose='reset_password'")).rejects.toMatchObject({ code: '23514' })
})

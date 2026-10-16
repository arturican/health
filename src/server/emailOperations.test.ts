// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let db: Awaited<ReturnType<typeof testDatabase>>
const now = '2026-10-16T10:00:00Z', later = '2026-10-16T10:01:00Z'
const email = 'Synthetic.User@example.test', hash = '$argon2id$synthetic-only'
const first = 'a'.repeat(64), second = 'b'.repeat(64)
beforeEach(async () => { db = await testDatabase(); await migrate(db.pool, await readMigrations()) })
afterEach(async () => { await db.close() })
const signup = (address = email, digest = first, moment = now) => db.runtime.query(
  'SELECT * FROM health.begin_email_registration($1,$2,$3,$4,$5)', [address, 'UTC', hash, digest, moment])
const issue = (purpose: string, digest = second, moment = later) => db.runtime.query(
  'SELECT * FROM health.issue_account_token($1,$2,$3,$4)', [email.toLowerCase(), purpose, digest, moment])
async function complete(purpose = 'verify_email', digest = first, moment = later) {
  return (await db.runtime.query<{ ok: boolean }>('SELECT health.complete_account_token($1,$2,$3,$4) AS ok',
    [digest, purpose, hash + '-changed', moment])).rows[0]?.ok
}

it('runtime создаёт неактивный аккаунт и хранит только переданный хеш токена', async () => {
  expect((await signup()).rows).toEqual([{ email }])
  expect((await db.pool.query('SELECT email,email_verified_at,email_required FROM health.users')).rows)
    .toEqual([{ email, email_verified_at: null, email_required: true }])
  expect((await db.pool.query('SELECT token_hash,purpose,expires_at-created_at AS duration FROM health.account_tokens')).rows)
    .toEqual([{ token_hash: first, purpose: 'verify_email', duration: { hours: 1 } }])
  expect((await signup(email.toLowerCase(), second, '2026-10-16T10:00:59Z')).rows).toEqual([])
  expect((await db.pool.query('SELECT id FROM health.users')).rowCount).toBe(1)
  expect((await signup(email.toLowerCase(), second, later)).rows).toEqual([{ email }])
  expect(await complete('verify_email', first)).toBe(false)
  expect(await complete('verify_email', second)).toBe(true)
  expect((await signup(email, first, '2026-10-16T10:02:00Z')).rows).toEqual([])
})

it.each(['2026-10-16T09:59:59Z', '2026-10-16T11:00:00Z', 'infinity'])('не погашает токен вне срока: %s', async moment => {
  await signup()
  expect(await complete('verify_email', first, moment)).toBe(false)
  expect((await db.pool.query('SELECT email_verified_at FROM health.users')).rows).toEqual([{ email_verified_at: null }])
})

it('сериализует два погашения; подтверждает и меняет пароль ровно один раз', async () => {
  await signup()
  expect((await Promise.all([complete(), complete()])).sort()).toEqual([false, true])
  expect(await complete()).toBe(false)
  expect((await db.pool.query('SELECT password_hash,email_verified_at FROM health.users')).rows)
    .toEqual([{ password_hash: hash + '-changed', email_verified_at: new Date(later) }])
  expect((await issue('reset_password', second)).rows).toEqual([{ email }])
  expect((await db.pool.query('SELECT expires_at-created_at AS duration FROM health.account_tokens WHERE purpose=$1', ['reset_password'])).rows)
    .toEqual([{ duration: { minutes: 15 } }])
  await db.pool.query(`INSERT INTO health.sessions SELECT $1,id,$2,$3,$2,NULL FROM health.users`,
    ['c'.repeat(64), later, '2026-10-17T10:00:00Z'])
  expect(await complete('reset_password', second, '2026-10-16T10:15:59Z')).toBe(true)
  expect((await db.pool.query('SELECT * FROM health.sessions')).rowCount).toBe(0)
  expect((await db.pool.query('SELECT purpose,consumed_at FROM health.account_tokens')).rows)
    .toEqual([{ purpose: 'reset_password', consumed_at: new Date('2026-10-16T10:15:59Z') }])
})

it('не выдаёт reset неподтверждённому/несуществующему адресу и не путает назначение', async () => {
  expect((await issue('reset_password')).rows).toEqual([])
  await signup()
  expect((await issue('reset_password')).rows).toEqual([])
  expect(await complete('reset_password')).toBe(false)
  expect(await complete('verify_email', second)).toBe(false)
  expect(await complete('other')).toBe(false)
  expect(await complete()).toBe(true)
  expect((await issue('verify_email')).rows).toEqual([])
})

it('не принимает снимок другого email и не затрагивает другие аккаунты', async () => {
  await signup(); await signup('other@example.test', second)
  await db.pool.query('UPDATE health.users SET email=$1 WHERE email=$2', ['changed@example.test', email])
  expect(await complete()).toBe(false)
  expect((await db.pool.query('SELECT count(*)::int AS total FROM health.users WHERE email_verified_at IS NULL')).rows).toEqual([{ total: 2 }])
})

it.each([null, '', 'bad-address'])('откатывает неверный/пустой email: %s', async address => {
  await expect(db.runtime.query('SELECT * FROM health.begin_email_registration($1,$2,$3,$4,$5)',
    [address, 'UTC', hash, first, now])).rejects.toMatchObject({ code: '23514' })
  expect((await db.pool.query('SELECT * FROM health.users')).rowCount).toBe(0)
})

it('прямые изменения закрыты, функции не выданы PUBLIC и search_path фиксирован', async () => {
  for (const sql of ['UPDATE health.users SET password_hash=NULL', 'SELECT * FROM health.account_tokens']) {
    await expect(db.runtime.query(sql)).rejects.toMatchObject({ code: '42501' })
  }
  const functions = await db.pool.query<{ public_access: boolean; prosecdef: boolean; proconfig: string[] }>(`SELECT
    EXISTS (SELECT FROM aclexplode(p.proacl) a WHERE a.grantee=0) AS public_access,prosecdef,proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='health'
    AND p.proname IN ('issue_account_token','begin_email_registration','complete_account_token')`)
  expect(functions.rows).toHaveLength(3)
  for (const row of functions.rows) expect(row).toEqual({ public_access: false, prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'] })
})

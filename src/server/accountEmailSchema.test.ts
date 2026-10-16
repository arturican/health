// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
const owner = '10000000-0000-4000-8000-000000000001'
const created = '2026-10-01T10:00:00Z'
const expires = '2026-10-01T10:15:00Z'
const email = 'Synthetic.User+tag@example.test'
const tokenHash = 'a'.repeat(64)
beforeEach(async () => { database = await testDatabase(); await migrate(database.pool, await readMigrations()) })
afterEach(async () => { await database.close() })

async function insertUser(address: string | null = null, id = owner) {
  await database.pool.query(`INSERT INTO health.users(id,login,password_hash,timezone,created_at,email)
    VALUES ($1,$2,$3,'UTC',$4,$5)`, [id, 'test-' + id, '$argon2id$synthetic-schema-only', created, address])
}

async function insertToken(overrides: Record<string, unknown> = {}) {
  const row = { tokenHash, owner, purpose: 'verify_email', email, created, expires, consumed: null, ...overrides }
  return database.pool.query(`INSERT INTO health.account_tokens(token_hash,user_id,purpose,email,created_at,expires_at,consumed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [row.tokenHash, row.owner, row.purpose, row.email, row.created, row.expires, row.consumed])
}

it('сохраняет регистр локальной части и запрещает второй аккаунт с тем же email', async () => {
  await insertUser(email)
  expect((await database.pool.query('SELECT email,email_verified_at FROM health.users')).rows).toEqual([{ email, email_verified_at: null }])
  await expect(insertUser(email.toLowerCase(), randomUUID())).rejects.toMatchObject({ code: '23505' })
  await insertUser('Synthetic.User@example.test', randomUUID())
  await insertUser('SyntheticUser+tag@example.test', randomUUID())
  expect((await database.pool.query('SELECT id FROM health.users')).rowCount).toBe(3)
})

it('принимает адрес длиной 254 байта, локальную часть 64 и DNS-метку 63', async () => {
  const maximum = 'a'.repeat(64) + '@' + 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(61)
  expect(maximum.length).toBe(254)
  await insertUser(maximum)
  await insertUser("a!#$%&'*+/=?^_`{|}~-z@xn--e1afmkfd.xn--p1ai", randomUUID())
})

it.each(['', 'name', 'a@localhost', '@example.test', 'a@@example.test', ' a@example.test',
  'a@example.test ', 'a@EXAMPLE.test', '.a@example.test', 'a..b@example.test', 'a.@example.test',
  'a@-example.test', 'a@example-.test', 'a@exam_ple.test', 'a@example..test',
  'имя@example.test', 'a@пример.рф', '"quoted"@example.test', 'a@[127.0.0.1]',
  'a@example.test\r\nBcc: synthetic@example.test', 'a'.repeat(65) + '@example.test',
  'a@' + 'a'.repeat(64) + '.test', 'a'.repeat(64) + '@' + 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(62)])('не сохраняет неподдерживаемый/неподготовленный email: %s', async value => {
  await expect(insertUser(value)).rejects.toMatchObject({ code: '23514' })
  expect((await database.pool.query('SELECT id FROM health.users')).rowCount).toBe(0)
})

it('разрешает старые аккаунты без email и требует адрес для подтверждения', async () => {
  await insertUser(); await insertUser(null, randomUUID())
  await expect(database.pool.query('UPDATE health.users SET email_verified_at=$1 WHERE id=$2', [created, owner])).rejects.toMatchObject({ code: '23514' })
  await database.pool.query('UPDATE health.users SET email=$1,email_verified_at=$2 WHERE id=$3', [email, created, owner])
  for (const value of ['2026-10-01T09:59:59Z', 'infinity', '-infinity']) {
    await expect(database.pool.query('UPDATE health.users SET email_verified_at=$1 WHERE id=$2', [value, owner])).rejects.toMatchObject({ code: '23514' })
  }
  await expect(database.pool.query('UPDATE health.users SET email=NULL WHERE id=$1', [owner])).rejects.toMatchObject({ code: '23514' })
})

it('хранит два назначения отдельно, ограничивает число токенов и каскадно удаляет их', async () => {
  await insertUser(email); await insertToken()
  await expect(insertToken({ tokenHash: 'b'.repeat(64) })).rejects.toMatchObject({ code: '23505' })
  await insertToken({ tokenHash: 'b'.repeat(64), purpose: 'reset_password' })
  const other = randomUUID()
  await insertUser(null, other)
  await expect(insertToken({ owner: other })).rejects.toMatchObject({ code: '23505' })
  await insertToken({ owner: other, tokenHash: 'c'.repeat(64) })
  await database.pool.query('DELETE FROM health.users WHERE id=$1', [owner])
  expect((await database.pool.query('SELECT user_id FROM health.account_tokens')).rows).toEqual([{ user_id: other }])
})

it.each([
  { tokenHash: 'plaintext-secret' }, { tokenHash: 'a'.repeat(63) }, { tokenHash: 'A'.repeat(64) },
  { tokenHash: 'a'.repeat(65) }, { purpose: 'session' }, { email: 'bad-address' },
  { created: 'infinity' }, { expires: 'infinity' }, { expires: '-infinity' }, { expires: created },
  { expires: '2026-10-01T09:59:59Z' }, { consumed: '2026-10-01T09:59:59Z' },
  { consumed: expires }, { consumed: 'infinity' },
])('отклоняет неверный хеш/назначение/адрес/интервал токена', async overrides => {
  await insertUser()
  await expect(insertToken(overrides)).rejects.toMatchObject({ code: '23514' })
  expect((await database.pool.query('SELECT token_hash FROM health.account_tokens')).rowCount).toBe(0)
})

it('требует обязательные поля и существующего владельца, принимает границы погашения', async () => {
  await expect(insertToken()).rejects.toMatchObject({ code: '23503' })
  await insertUser()
  for (const field of ['tokenHash', 'owner', 'purpose', 'email', 'created', 'expires']) {
    await expect(insertToken({ [field]: null })).rejects.toMatchObject({ code: '23502' })
  }
  await insertToken({ consumed: created })
  await insertToken({ tokenHash: 'b'.repeat(64), purpose: 'reset_password', consumed: '2026-10-01T10:14:59.999Z' })
  expect((await database.pool.query('SELECT token_hash FROM health.account_tokens')).rowCount).toBe(2)
})

it('не расширяет runtime-права на пользователей и закрывает все CRUD токенов', async () => {
  await insertUser(email); await insertToken()
  for (const sql of ['SELECT * FROM health.account_tokens', 'INSERT INTO health.account_tokens DEFAULT VALUES',
    'UPDATE health.account_tokens SET consumed_at=NULL', 'DELETE FROM health.account_tokens',
    'UPDATE health.users SET email_verified_at=now()', 'INSERT INTO health.users DEFAULT VALUES']) {
    await expect(database.runtime.query(sql)).rejects.toMatchObject({ code: '42501' })
  }
  const rights = await database.pool.query<{ public_access: boolean }>(`SELECT EXISTS (
    SELECT FROM pg_class c, LATERAL aclexplode(c.relacl) acl
    WHERE c.oid='health.account_tokens'::regclass AND acl.grantee=0) AS public_access`)
  expect(rights.rows).toEqual([{ public_access: false }])
})

it('обновляет прежнюю схему без потери аккаунта и активной сессии', async () => {
  const old = await testDatabase()
  try {
    const migrations = (await readMigrations()).filter(item => item.name <= '012_account_email.sql')
    await migrate(old.pool, migrations.filter(item => item.name < '012_account_email.sql'))
    await old.pool.query(`INSERT INTO health.users(id,login,password_hash,timezone,created_at)
      VALUES ($1,'legacy-user','$argon2id$synthetic-migration-only','UTC',$2)`, [owner, created])
    await old.pool.query(`INSERT INTO health.sessions(token_hash,user_id,created_at,expires_at,last_seen_at)
      VALUES ($1,$2,$3,$4,$3)`, [tokenHash, owner, created, expires])
    const users = (await old.pool.query<Record<string, unknown>>('SELECT * FROM health.users')).rows
    const sessions = (await old.pool.query<Record<string, unknown>>('SELECT * FROM health.sessions')).rows
    expect(await migrate(old.pool, migrations)).toBe(1)
    expect(await migrate(old.pool, migrations)).toBe(0)
    expect((await old.pool.query('SELECT * FROM health.users')).rows).toEqual(users.map(row => ({ ...row, email: null, email_verified_at: null })))
    expect((await old.pool.query('SELECT * FROM health.sessions')).rows).toEqual(sessions)
  } finally { await old.close() }
})

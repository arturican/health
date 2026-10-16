// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testDatabase } from '../../tests/serverDatabase'
import { createAccount } from './accounts'
import { createSessions, tokenHash } from './sessions'
import { migrate, readMigrations } from './migrations'
import { withUser } from './userTransaction'

let database: Awaited<ReturnType<typeof testDatabase>>, sql: string
const now = new Date('2026-10-16T10:00:00Z')
const credentials = { login: 'synthetic', password: 'synthetic-password-only', timezone: 'UTC' }
const resetToken = 'c'.repeat(64)

async function seed(target: typeof database) {
  await migrate(target.pool, await readMigrations())
  const account = await createAccount(target.pool, credentials)
  await target.pool.query(`UPDATE health.users SET created_at=$2,email='synthetic@example.test',email_verified_at=$3 WHERE id=$1`,
    [account.id, '2026-10-16T09:00:00Z', now])
  const sessions = await createSessions(target.runtime)
  const session = await sessions.login({ login: credentials.login, password: credentials.password }, null, now)
  if (!session) throw new Error('Нет синтетической сессии')
  await target.pool.query(`INSERT INTO health.account_tokens VALUES ($1,$2,'reset_password','synthetic@example.test',$3,$4,NULL)`,
    [tokenHash(resetToken), account.id, now, new Date(now.getTime() + 900000)])
  await target.pool.query(`INSERT INTO health.products(user_id,id,name,source,kcal)
    VALUES ($1,gen_random_uuid(),'Synthetic product','',100)`, [account.id])
  return { account, session, sessions }
}

async function counts(target = database) {
  const result = await target.pool.query<Record<string, unknown>>(`SELECT (SELECT count(*)::text FROM health.sessions) AS sessions,
    (SELECT count(*)::text FROM health.account_tokens) AS tokens, (SELECT count(*)::text FROM health.products) AS products`)
  return result.rows
}

beforeEach(async () => {
  database = await testDatabase('health_restore')
  sql = await readFile('deploy/revoke-restored-access.sql', 'utf8')
})
afterEach(async () => { await database.close() })

it('отзывает восстановленные сессии и ссылки, повторяется и сохраняет дневник/вход', async () => {
  const { account, session, sessions } = await seed(database)
  expect(await sessions.read(session.token, now)).not.toBeNull()
  await database.pool.query(sql)
  await database.pool.query(sql)
  expect(await counts()).toEqual([{ sessions: '0', tokens: '0', products: '1' }])
  expect(await sessions.read(session.token, now)).toBeNull()
  expect((await database.runtime.query('SELECT health.complete_account_token($1,$2,$3,$4) AS ok',
    [tokenHash(resetToken), 'reset_password', '$argon2id$synthetic-only', now])).rows).toEqual([{ ok: false }])
  expect(await withUser(database.runtime, account, async client => (await client.query<Record<string, unknown>>('SELECT name FROM health.products')).rows))
    .toEqual([{ name: 'Synthetic product' }])
  expect(await sessions.login({ login: credentials.login, password: credentials.password }, null, now)).not.toBeNull()
})

it('runtime не может очистить восстановленный доступ', async () => {
  await seed(database)
  await expect(database.runtime.query(sql)).rejects.toMatchObject({ code: '42501' })
  expect(await counts()).toEqual([{ sessions: '1', tokens: '1', products: '1' }])
})

it('неверное имя целевой БД отклоняется до удаления данных', async () => {
  const other = await testDatabase()
  try {
    await seed(other)
    await expect(other.pool.query(sql)).rejects.toThrow('Expected an isolated health_restore database')
    expect(await counts(other)).toEqual([{ sessions: '1', tokens: '1', products: '1' }])
  } finally { await other.close() }
})

it('ошибка удаления сессий откатывает уже выполненное удаление ссылок', async () => {
  await seed(database)
  await database.pool.query(`CREATE FUNCTION health.fail_revoke() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic-revoke-failure'; END $$;
    CREATE TRIGGER fail_revoke BEFORE DELETE ON health.sessions FOR EACH STATEMENT EXECUTE FUNCTION health.fail_revoke()`)
  await expect(database.pool.query(sql)).rejects.toThrow('synthetic-revoke-failure')
  expect(await counts()).toEqual([{ sessions: '1', tokens: '1', products: '1' }])
})

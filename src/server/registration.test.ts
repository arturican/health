// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { verify } from 'argon2'
import { registrationSchema } from '../domain/registration'
import { accountSchema, hashPassword } from './accounts'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
const input = { login: ' New-user ', password: 'synthetic-register-password', timezone: 'Europe/Moscow' }
beforeEach(async () => { database = await testDatabase(); await migrate(database.pool, await readMigrations()) })
afterEach(async () => { await database.close() })

// Preserve checks of the immutable SQL contract after retiring its HTTP wrapper.
async function registerAccount(input: unknown) {
  const values = registrationSchema.parse(input)
  const encoded = await hashPassword(values.password)
  const result = await database.runtime.query<Record<string, unknown>>(
    'SELECT * FROM health.register_account($1, $2, $3)', [values.login, encoded, values.timezone])
  return result.rows[0] ? accountSchema.parse(result.rows[0]) : null
}

it('создаёт аккаунт ограниченной ролью, сохраняет Argon2id и публичные поля', async () => {
  const account = await registerAccount(input)
  if (!account) throw new Error('Нет аккаунта')
  expect(account.id).toMatch(/^[a-f0-9-]{36}$/)
  expect(account).toEqual({ id: account.id, login: 'new-user', timezone: input.timezone })
  const rows = await database.pool.query<{ password_hash: string }>('SELECT password_hash FROM health.users')
  const encoded = rows.rows[0]?.password_hash
  if (!encoded) throw new Error('Нет хеша')
  expect(encoded).toMatch(/^\$argon2id\$/)
  expect(await verify(encoded, input.password)).toBe(true)
  for (const sql of ['INSERT INTO health.users DEFAULT VALUES', 'UPDATE health.users SET login = login', 'DELETE FROM health.users']) {
    await expect(database.runtime.query(sql)).rejects.toMatchObject({ code: '42501' })
  }
})

it('конкурентный повтор нормализованного логина не меняет пароль или часовой пояс', async () => {
  const results = await Promise.all([registerAccount(input), registerAccount(input)])
  expect(results.filter(Boolean)).toHaveLength(1)
  const before = (await database.pool.query('SELECT * FROM health.users')).rows
  expect(await registerAccount({ ...input, password: 'another-synthetic-password', timezone: 'UTC' })).toBeNull()
  expect((await database.pool.query('SELECT * FROM health.users')).rows).toEqual(before)
})

it.each([null, {}, { ...input, login: 'bad login' }, { ...input, password: 'short' },
  { ...input, password: 'x'.repeat(1025) }, { ...input, timezone: 'Mars/Base' }, { ...input, id: 'injected' }])('не создаёт аккаунт при неверном вводе', async value => {
  await expect(registerAccount(value)).rejects.toThrow()
  expect((await database.pool.query('SELECT id FROM health.users')).rowCount).toBe(0)
})

it('фиксирует search_path, запрещает PUBLIC execute и соблюдает ограничения таблицы', async () => {
  const result = await database.pool.query<{ prosecdef: boolean; proconfig: string[]; public_execute: boolean }>(`
    SELECT prosecdef, proconfig, EXISTS(SELECT FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
    FROM pg_proc WHERE oid='health.register_account(text,text,text)'::regprocedure`)
  expect(result.rows).toEqual([{ prosecdef: true, proconfig: ['search_path=pg_catalog, pg_temp'], public_execute: false }])
  await expect(database.runtime.query('SELECT * FROM health.register_account($1,$2,$3)', ['BAD', 'plaintext', 'UTC'])).rejects.toMatchObject({ code: '23514' })
  expect((await database.pool.query('SELECT id FROM health.users')).rowCount).toBe(0)
})

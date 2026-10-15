// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
beforeEach(async () => { database = await testDatabase(); await migrate(database.pool, await readMigrations()) })
afterEach(async () => { await database.close() })
const hash = '$argon2id$synthetic-schema-test-only'
const userId = '10000000-0000-4000-8000-000000000001'
const created = '2026-10-01T10:00:00Z'
const expires = '2026-10-08T10:00:00Z'

async function insertUser(login = 'demo', id = userId) {
  await database.pool.query('INSERT INTO health.users(id, login, password_hash, timezone) VALUES ($1, $2, $3, $4)', [id, login, hash, 'Europe/Moscow'])
}

it('ограничивает логин, обязательность, уникальность и формат хеша', async () => {
  await insertUser()
  await expect(insertUser('demo', randomUUID())).rejects.toMatchObject({ code: '23505' })
  for (const login of ['UPPER', 'a', '', 'a'.repeat(65), 'with space']) {
    await expect(insertUser(login, randomUUID())).rejects.toMatchObject({ code: '23514' })
  }
  await expect(database.pool.query('INSERT INTO health.users(id, login, password_hash, timezone) VALUES ($1, $2, $3, $4)', [randomUUID(), 'other', 'plaintext', 'UTC'])).rejects.toMatchObject({ code: '23514' })
  await expect(database.pool.query('INSERT INTO health.users(id, login) VALUES ($1, $2)', [randomUUID(), 'empty'])).rejects.toMatchObject({ code: '23502' })
})

it('проверяет владельца/сроки сессии и каскад удаления аккаунта', async () => {
  const sql = 'INSERT INTO health.sessions(token_hash, user_id, created_at, expires_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)'
  await expect(database.runtime.query(sql, ['a'.repeat(64), userId, created, expires, created])).rejects.toMatchObject({ code: '23503' })
  await insertUser()
  await expect(database.runtime.query(sql, ['a'.repeat(64), userId, created, created, created])).rejects.toMatchObject({ code: '23514' })
  await expect(database.runtime.query(sql, ['not-a-hash', userId, created, expires, created])).rejects.toMatchObject({ code: '23514' })
  await database.runtime.query(sql, ['a'.repeat(64), userId, created, expires, created])
  expect((await database.runtime.query('SELECT user_id FROM health.sessions')).rows).toEqual([{ user_id: userId }])
  await database.pool.query('DELETE FROM health.users WHERE id = $1', [userId])
  expect((await database.runtime.query('SELECT user_id FROM health.sessions')).rowCount).toBe(0)
})

it('роль приложения не владеет таблицами и не может менять схему или аккаунты', async () => {
  const result = await database.runtime.query<Record<string, unknown>>('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user')
  expect(result.rows).toEqual([{ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false }])
  for (const sql of ['CREATE TABLE health.forbidden(id int)', 'SELECT * FROM health.schema_migrations', 'DELETE FROM health.users', 'ALTER TABLE health.users ADD COLUMN forbidden int']) {
    await expect(database.runtime.query(sql)).rejects.toMatchObject({ code: '42501' })
  }
  await expect(database.runtime.query('SELECT * FROM health.users')).resolves.toMatchObject({ rowCount: 0 })
})

// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createAccount } from './accounts'
import { createSessions, csrfToken, SESSION_IDLE_MS, SESSION_LIFETIME_MS, tokenHash, type Sessions } from './sessions'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
let sessions: Sessions
const credentials = { login: 'demo', password: 'synthetic-password-only' }
const now = new Date('2026-10-01T10:00:00Z')
beforeEach(async () => {
  database = await testDatabase()
  await migrate(database.pool, await readMigrations())
  await createAccount(database.pool, { ...credentials, timezone: 'Europe/Moscow' })
  sessions = await createSessions(database.runtime)
})
afterEach(async () => { await database.close() })

async function login() {
  const session = await sessions.login(credentials, undefined, now)
  if (!session) throw new Error('Не создана тестовая сессия')
  return session
}

it('сохраняет только хеш токена, получает владельца из сессии', async () => {
  const session = await login()
  expect(session.token).toMatch(/^[a-f0-9]{64}$/)
  expect(await sessions.read(session.token, now)).toEqual(session.account)
  const rows = (await database.pool.query('SELECT token_hash FROM health.sessions')).rows
  expect(rows).toEqual([{ token_hash: tokenHash(session.token) }])
  expect(JSON.stringify(rows)).not.toContain(session.token)
  expect(csrfToken(session.token)).not.toBe(session.token)
  expect(csrfToken(session.token)).not.toBe(tokenHash(session.token))
})

it.each([null, {}, { ...credentials, login: 'missing' }, { ...credentials, password: 'incorrect-password-only' }, { ...credentials, user_id: 'injected' }])('не создаёт сессию при неверных реквизитах', async input => {
  expect(await sessions.login(input, null, now)).toBeNull()
  expect((await database.pool.query('SELECT token_hash FROM health.sessions')).rowCount).toBe(0)
})

it('меняет токен, отзывает предыдущий и позволяет повторный выход', async () => {
  const first = await login()
  const second = await sessions.login(credentials, first.token, now)
  if (!second) throw new Error('Нет второй сессии')
  expect(second.token).not.toBe(first.token)
  expect(await sessions.read(first.token, now)).toBeNull()
  expect(await sessions.read(second.token, now)).toEqual(first.account)
  await sessions.logout(second.token, now)
  await sessions.logout(second.token, now)
  expect(await sessions.read(second.token, now)).toBeNull()
})

it.each([-1, 0])('проверяет границу неактивности со смещением %s мс', async delta => {
  const session = await login()
  const account = await sessions.read(session.token, new Date(now.getTime() + SESSION_IDLE_MS + delta))
  expect(account).toEqual(delta < 0 ? session.account : null)
})

it('активность продлевает idle, но не абсолютный срок', async () => {
  const session = await login()
  for (let hours = 12; hours < 7 * 24; hours += 12) {
    expect(await sessions.read(session.token, new Date(now.getTime() + hours * 3600000))).toEqual(session.account)
  }
  expect(await sessions.read(session.token, new Date(now.getTime() + SESSION_LIFETIME_MS - 1))).toEqual(session.account)
  expect(await sessions.read(session.token, new Date(now.getTime() + SESSION_LIFETIME_MS))).toBeNull()
})

it('отклоняет неизвестный/неверный токен и удалённого владельца', async () => {
  const session = await login()
  for (const token of [undefined, '', 'bad', 'a'.repeat(64)]) expect(await sessions.read(token, now)).toBeNull()
  await sessions.logout(null, now)
  await database.pool.query('DELETE FROM health.users WHERE id = $1', [session.account.id])
  expect(await sessions.read(session.token, now)).toBeNull()
})

it('ошибка создания новой сессии откатывает отзыв прежней', async () => {
  const session = await login()
  await database.pool.query(`CREATE FUNCTION health.reject_session() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
    CREATE TRIGGER reject_session BEFORE INSERT ON health.sessions FOR EACH ROW EXECUTE FUNCTION health.reject_session();`)
  await expect(sessions.login(credentials, session.token, now)).rejects.toThrow('synthetic failure')
  expect(await sessions.read(session.token, now)).toEqual(session.account)
  expect((await database.pool.query('SELECT token_hash FROM health.sessions')).rowCount).toBe(1)
})

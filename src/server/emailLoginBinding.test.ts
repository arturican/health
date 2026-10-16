// @vitest-environment node
import { verify } from 'argon2'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { createApi } from './app'
import { registerAuthentication } from './auth'
import { createAccount, hashPassword } from './accounts'
import { createSessions, csrfToken, tokenHash, type Sessions } from './sessions'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApi>, sessions: Sessions
let session: NonNullable<Awaited<ReturnType<Sessions['login']>>>
let messages: string[]
const now = new Date('2026-10-16T10:00:00Z'), origin = 'https://synthetic.example.test'
const email = 'Synthetic.User@example.test', password = 'synthetic-old-password', replacement = 'synthetic-new-password'
beforeEach(async () => {
  db = await testDatabase(); await migrate(db.pool, await readMigrations())
  await createAccount(db.pool, { login: 'legacy-user', password, timezone: 'UTC' })
  await db.pool.query('UPDATE health.users SET created_at=$1', ['2026-10-16T09:00:00Z'])
  sessions = await createSessions(db.runtime)
  const value = await sessions.login({ login: 'legacy-user', password }, null, now)
  if (!value) throw new Error('Нет прежней сессии')
  session = value; messages = []; app = createApi()
  app.decorate('accountMail', {
    send: (input: unknown) => { messages.push(z.object({ text: z.string() }).parse(input).text); return Promise.resolve() },
    close: () => Promise.resolve(),
  })
  await registerAuthentication(app, db.runtime, origin, () => now)
})
afterEach(async () => { await app.close(); await db.close() })
const headers = () => ({ origin, cookie: '__Host-health_session=' + session.token, 'x-csrf-token': csrfToken(session.token), 'content-type': 'application/json' })
const bind = (value: unknown = { email, password }, extra = {}) => app.inject({
  method: 'POST', url: '/api/v1/auth/email/bind', headers: { ...headers(), ...extra }, payload: JSON.stringify(value),
})
async function activate(digest: string, purpose = 'verify_email') {
  return db.runtime.query<{ ok: boolean }>('SELECT health.complete_account_token($1,$2,$3,$4) AS ok',
    [digest, purpose, await hashPassword(replacement), now])
}
function token() {
  const value = messages[0]?.match(/token=([a-f0-9]{64})/)?.[1]
  if (!value) throw new Error('Нет ссылки привязки')
  return value
}

it('не допускает новый аккаунт до подтверждения или по техническому login', async () => {
  await db.runtime.query('SELECT * FROM health.begin_email_registration($1,$2,$3,$4,$5)', [email, 'UTC', await hashPassword(password), 'a'.repeat(64), now])
  const row = await db.pool.query<{ login: string }>('SELECT login FROM health.users WHERE email=$1', [email])
  expect(await sessions.login({ login: email, password }, null, now)).toBeNull()
  expect(await sessions.login({ login: row.rows[0]?.login, password }, null, now)).toBeNull()
  await activate('a'.repeat(64))
  expect(await sessions.login({ login: email.toUpperCase(), password: replacement }, null, now)).not.toBeNull()
  expect(await sessions.login({ login: row.rows[0]?.login, password: replacement }, null, now)).toBeNull()
})

it('привязывает адрес после текущего пароля и письма, сохраняет аккаунт и старый login', async () => {
  expect((await bind()).statusCode).toBe(202)
  expect((await db.pool.query('SELECT email FROM health.users')).rows).toEqual([{ email: null }])
  expect((await activate(tokenHash(token()))).rows).toEqual([{ ok: true }])
  expect((await db.pool.query('SELECT id,login,timezone,email FROM health.users')).rows)
    .toEqual([{ ...session.account, email }])
  expect(await sessions.read(session.token, now)).toBeNull()
  expect(await sessions.login({ login: 'legacy-user', password: replacement }, null, now)).not.toBeNull()
  expect(await sessions.login({ login: ' SYNTHETIC.USER@EXAMPLE.TEST ', password: replacement }, null, now)).not.toBeNull()
  expect(await sessions.login({ login: email, password }, null, now)).toBeNull()
})

it('запрещает чужой Origin, отсутствие CSRF/сессии и неверный текущий пароль', async () => {
  expect((await bind(undefined, { origin: 'https://attacker.example.test' })).statusCode).toBe(403)
  expect((await bind(undefined, { 'x-csrf-token': '' })).statusCode).toBe(403)
  expect((await bind(undefined, { cookie: '' })).statusCode).toBe(401)
  expect((await bind({ email, password: replacement })).statusCode).toBe(400)
  expect((await bind({ email, password, user_id: 'other' })).statusCode).toBe(400)
  expect(messages).toEqual([])
})

it('не перехватывает занятый адрес и не раскрывает его владельца', async () => {
  await db.runtime.query('SELECT * FROM health.begin_email_registration($1,$2,$3,$4,$5)', [email, 'UTC', await hashPassword(password), 'a'.repeat(64), now])
  await activate('a'.repeat(64))
  const result = await bind()
  expect(result.statusCode).toBe(202); expect(result.json<unknown>()).toEqual({ accepted: true })
  expect(messages).toEqual([])
  expect((await db.pool.query('SELECT email FROM health.users WHERE id=$1', [session.account.id])).rows).toEqual([{ email: null }])
})

it('при конфликте, возникшем после отправки письма, не меняет ни один аккаунт', async () => {
  await bind(); const digest = tokenHash(token())
  await db.runtime.query('SELECT * FROM health.begin_email_registration($1,$2,$3,$4,$5)', [email, 'UTC', await hashPassword(password), 'a'.repeat(64), now])
  expect((await activate(digest)).rows).toEqual([{ ok: false }])
  expect(await sessions.read(session.token, now)).toEqual(session.account)
  expect((await db.pool.query('SELECT password_hash FROM health.users WHERE id=$1', [session.account.id])).rowCount).toBe(1)
})

it('не создаёт сессию старым паролем, проверенным до одновременного сброса', async () => {
  await bind(); await activate(tokenHash(token()))
  await db.runtime.query('SELECT * FROM health.issue_account_token($1,$2,$3,$4)', [email, 'reset_password', 'd'.repeat(64), now])
  let release: () => void = () => { throw new Error('Нет ожидания') }
  let arrived: () => void = () => { throw new Error('Нет проверки') }
  const reached = new Promise<void>(resolve => { arrived = resolve })
  const proceed = new Promise<void>(resolve => { release = resolve })
  const racing = await createSessions(db.runtime, async (encoded, supplied) => {
    const valid = await verify(encoded, supplied); arrived(); await proceed; return valid
  })
  const pending = racing.login({ login: email, password: replacement }, null, now)
  await reached
  try {
    await db.runtime.query('SELECT health.complete_account_token($1,$2,$3,$4)', ['d'.repeat(64), 'reset_password', await hashPassword(password), now])
  } finally { release() }
  expect(await pending).toBeNull()
  expect((await db.pool.query('SELECT * FROM health.sessions')).rowCount).toBe(0)
})

it('показывает email только текущему аккаунту и ограничивает попытки привязки', async () => {
  expect((await app.inject({ url: '/api/v1/auth/email' })).statusCode).toBe(401)
  const result = await app.inject({ url: '/api/v1/auth/email', headers: headers() })
  expect(result.json<unknown>()).toEqual({ email: null, verified: false })
  for (let index = 0; index < 5; index++) expect((await bind({ email, password: replacement })).statusCode).toBe(400)
  expect((await bind()).statusCode).toBe(429)
})

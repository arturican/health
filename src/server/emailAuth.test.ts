// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApi } from './app'
import { registerAuthentication } from './auth'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'
import { diaryDate } from './recordValidation'
import { tokenHash } from './sessions'

let db: Awaited<ReturnType<typeof testDatabase>>, app: ReturnType<typeof createApi>
let now: Date
let messages: { to: string; subject: string; text: string }[]
const diagnostics = vi.fn<(event: string) => void>()
const send = vi.fn<(input: unknown) => Promise<void>>()
const origin = 'https://synthetic.example.test', email = 'Synthetic.User@example.test'
const password = ' synthetic-password-only '
beforeEach(async () => {
  db = await testDatabase(); await migrate(db.pool, await readMigrations())
  diagnostics.mockClear(); app = createApi(false, diagnostics); messages = []; now = new Date('2026-10-16T10:00:00Z')
  send.mockImplementation(input => {
    if (!input || typeof input !== 'object' || !('text' in input) || typeof input.text !== 'string') throw new Error('Нет письма')
    messages.push({ to: email, subject: '', text: input.text }); return Promise.resolve()
  })
  app.decorate('accountMail', { send, close: () => Promise.resolve() })
  await registerAuthentication(app, db.runtime, origin, () => now)
})
afterEach(async () => { await app.close(); await db.close(); send.mockReset() })
const post = (route: string, payload: unknown, suppliedOrigin = origin) => app.inject({
  method: 'POST', url: '/api/v1/auth/email/' + route,
  headers: { origin: suppliedOrigin, 'content-type': 'application/json' }, payload: JSON.stringify(payload),
})
function secret(index = messages.length - 1) {
  const token = messages[index]?.text.match(/token=([a-f0-9]{64})/)?.[1]
  if (!token) throw new Error('Нет синтетического секрета в письме')
  return token
}
const signup = () => post('register', { email: ' Synthetic.User@EXAMPLE.TEST ', timezone: 'UTC' })
const finish = (token: string, purpose = 'verify_email') => post('complete', { token, purpose, password })

it('выдаёт секрет только письмом, хранит SHA-256, завершает регистрацию без автологина', async () => {
  const response = await signup()
  expect(response.statusCode).toBe(202); expect(response.json<unknown>()).toEqual({ accepted: true })
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: email }))
  const token = secret()
  expect(messages[0]?.text).toContain(origin + '/#auth=verify_email&token=' + token)
  expect((await db.pool.query('SELECT token_hash FROM health.account_tokens')).rows).toEqual([{ token_hash: tokenHash(token) }])
  const completed = await finish(token)
  expect(completed.statusCode).toBe(200); expect(completed.headers['set-cookie']).toContain('Max-Age=0')
  expect((await finish(token)).statusCode).toBe(400)
  expect(diagnostics).not.toHaveBeenCalled()
  expect((await db.pool.query('SELECT email_verified_at FROM health.users')).rows).toEqual([{ email_verified_at: now }])
})

it('одинаково отвечает для неизвестного, неподтверждённого и подтверждённого адреса', async () => {
  const unknown = await post('request', { email, purpose: 'reset_password' })
  await signup()
  const pending = await post('request', { email, purpose: 'reset_password' })
  await finish(secret())
  const verified = await signup()
  for (const response of [unknown, pending, verified]) {
    expect(response.statusCode).toBe(202); expect(response.json<unknown>()).toEqual({ accepted: true })
  }
  expect(messages).toHaveLength(1)
})

it('повтор verify заменяет ссылку, reset действует 15 минут и удаляет сессии', async () => {
  await signup(); const old = secret()
  now = new Date('2026-10-16T10:01:00Z')
  await post('request', { email, purpose: 'verify_email' }); const token = secret()
  expect(token).not.toBe(old); expect((await finish(old)).statusCode).toBe(400)
  expect((await finish(token)).statusCode).toBe(200)
  await db.pool.query(`INSERT INTO health.sessions SELECT $1,id,$2,$3,$2,NULL FROM health.users`,
    ['c'.repeat(64), now, '2026-10-17T10:00:00Z'])
  await post('request', { email, purpose: 'reset_password' }); const reset = secret()
  expect(messages.at(-1)?.text).toContain('15 минут')
  expect((await finish(reset, 'verify_email')).statusCode).toBe(400)
  expect((await finish(reset, 'reset_password')).statusCode).toBe(200)
  expect((await db.pool.query('SELECT * FROM health.sessions')).rowCount).toBe(0)
})

it('не раскрывает SMTP-ошибку и не ждёт подтверждения SMTP для ответа', async () => {
  send.mockRejectedValueOnce(new Error(email + ' private-token'))
  expect((await signup()).json<unknown>()).toEqual({ accepted: true })
  let release: () => void = () => { throw new Error('Нет ожидания') }
  send.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  now = new Date('2026-10-16T10:01:00Z')
  const response = await signup()
  expect(response.statusCode).toBe(202); release()
  expect(diagnostics).toHaveBeenCalledExactlyOnceWith('email_delivery_failed')
})

it('ограничивает выдачу и погашение, не раскрывая существование email', async () => {
  for (let attempt = 0; attempt < 7; attempt++) {
    now = new Date(Date.UTC(2026, 9, 16, 10, attempt))
    expect((await signup()).statusCode).toBe(202)
  }
  expect(messages).toHaveLength(5)
  for (let attempt = 0; attempt < 10; attempt++) expect((await finish('bad')).statusCode).toBe(400)
  expect((await finish('bad')).statusCode).toBe(429)
})

it.each(['https://attacker.example.test', 'null', ''])('отклоняет чужой/отсутствующий Origin: %s', async value => {
  expect((await post('register', { email, timezone: 'UTC' }, value)).statusCode).toBe(403)
  expect(messages).toHaveLength(0)
})

it('не принимает неподдерживаемый email, отсутствующие поля или просроченную ссылку', async () => {
  expect((await post('register', { email: 'example.test', timezone: 'UTC' })).statusCode).toBe(400)
  expect((await post('request', {})).statusCode).toBe(400)
  await signup(); const token = secret()
  now = new Date('2026-10-16T11:00:00Z')
  expect((await finish(token)).statusCode).toBe(400)
})

it('без включённой почты выдача недоступна и не создаёт аккаунт', async () => {
  const disabled = createApi()
  try {
    await registerAuthentication(disabled, db.runtime, origin, () => now)
    expect((await disabled.inject({ method: 'POST', url: '/api/v1/auth/email/register', headers: { origin }, payload: { email, timezone: 'UTC' } })).statusCode).toBe(503)
    expect((await db.pool.query('SELECT * FROM health.users')).rowCount).toBe(0)
  } finally { await disabled.close() }
})

it('повтор регистрации применяет выбранный пояс при подтверждении, вход и день используют его', async () => {
  await signup()
  const previous = secret()
  now = new Date('2026-10-16T10:01:00Z')
  expect((await post('register', { email, timezone: 'Asia/Tokyo' })).statusCode).toBe(202)
  expect((await finish(previous)).statusCode).toBe(400)
  expect((await finish(secret())).statusCode).toBe(200)
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { login: email, password } })
  expect(login.statusCode).toBe(200)
  const response = login.json<{ account: { timezone: string } }>()
  expect(response.account.timezone).toBe('Asia/Tokyo')
  expect(diaryDate(response.account.timezone, new Date('2026-10-16T23:30:00Z'))).toBe('2026-10-17')
})

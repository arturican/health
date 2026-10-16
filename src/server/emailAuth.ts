import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { emailAddress, emailCompletion, emailRegistration, emailRequest } from '../domain/emailAccount'
import { hashPassword } from './accounts.js'
import { tokenHash } from './sessions.js'
import { createLoginLimit } from './loginLimit.js'
import { createRegistrationLimit } from './registration.js'
import { sessionCookie } from './httpSecurity.js'

export type PasswordWork = { active: number }
const accepted = { accepted: true }
export async function registerEmailAuth(app: FastifyInstance, pool: Pool, origin: string, work: PasswordWork, clock: () => Date) {
  const mail = app.hasDecorator('accountMail') ? app.accountMail : null
  const pendingHash = mail ? await hashPassword(randomBytes(32).toString('hex')) : ''
  const allowIssue = createLoginLimit(), allowComplete = createRegistrationLimit()
  const deliveries = new Set<Promise<void>>()
  app.addHook('onClose', async () => { await Promise.allSettled(deliveries) })

  function deliver(rows: unknown, token: string, purpose: 'verify_email' | 'reset_password') {
    const addresses = z.array(z.object({ email: emailAddress })).parse(rows)
    const address = addresses[0]?.email
    if (!address || !mail) return
    const link = `${origin}/#auth=${purpose}&token=${token}`
    const delivery = mail.send({ to: address,
      subject: purpose === 'verify_email' ? 'Завершите регистрацию в дневнике' : 'Восстановление доступа к дневнику',
      text: `Чтобы задать пароль, откройте ссылку:\n${link}\n\nСсылка одноразовая и действует ${purpose === 'verify_email' ? '1 час' : '15 минут'}.\nЕсли вы не запрашивали это письмо, ничего делать не нужно.`,
    }).catch(() => { /* Same public response for every recipient and delivery outcome. */ })
    deliveries.add(delivery)
    void delivery.finally(() => { deliveries.delete(delivery) })
  }

  app.post('/api/v1/auth/email/register', async (request, reply) => {
    if (!mail) return reply.code(503).send({ error: { code: 'mail_unavailable', message: 'Почта временно недоступна' } })
    const parsed = emailRegistration.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: { code: 'invalid_data', message: 'Проверьте почту и часовой пояс' } })
    if (!allowIssue(request.ip, parsed.data.email.toLowerCase(), clock().getTime())) return reply.code(202).send(accepted)
    const token = randomBytes(32).toString('hex')
    const result = await pool.query<Record<string, unknown>>('SELECT * FROM health.begin_email_registration($1,$2,$3,$4,$5)',
      [parsed.data.email, parsed.data.timezone, pendingHash, tokenHash(token), clock()])
    deliver(result.rows, token, 'verify_email')
    return reply.code(202).send(accepted)
  })
  app.post('/api/v1/auth/email/request', async (request, reply) => {
    if (!mail) return reply.code(503).send({ error: { code: 'mail_unavailable', message: 'Почта временно недоступна' } })
    const parsed = emailRequest.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: { code: 'invalid_data', message: 'Проверьте почту' } })
    if (!allowIssue(request.ip, parsed.data.email.toLowerCase(), clock().getTime())) return reply.code(202).send(accepted)
    const token = randomBytes(32).toString('hex')
    const result = await pool.query<Record<string, unknown>>('SELECT * FROM health.issue_account_token($1,$2,$3,$4)',
      [parsed.data.email, parsed.data.purpose, tokenHash(token), clock()])
    deliver(result.rows, token, parsed.data.purpose)
    return reply.code(202).send(accepted)
  })
  app.post('/api/v1/auth/email/complete', async (request, reply) => {
    if (!mail) return reply.code(503).send({ error: { code: 'mail_unavailable', message: 'Почта временно недоступна' } })
    if (work.active >= 4 || !allowComplete(request.ip, clock().getTime())) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Повторите позже' } })
    const parsed = emailCompletion.safeParse(request.body)
    const invalid = () => reply.code(400).send({ error: { code: 'invalid_link', message: 'Ссылка недействительна или истекла. Запросите новую.' } })
    if (!parsed.success) return invalid()
    work.active++
    try {
      const encoded = await hashPassword(parsed.data.password)
      const result = await pool.query<Record<string, unknown>>('SELECT health.complete_account_token($1,$2,$3,$4) AS ok',
        [tokenHash(parsed.data.token), parsed.data.purpose, encoded, clock()])
      if (!z.object({ ok: z.boolean() }).parse(result.rows[0]).ok) return await invalid()
      return await reply.header('Set-Cookie', sessionCookie('', 0)).send(accepted)
    } finally { work.active-- }
  })
}

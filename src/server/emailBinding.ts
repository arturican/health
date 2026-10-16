import { randomBytes } from 'node:crypto'
import { verify } from 'argon2'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { emailSchema, emailAddress } from '../domain/emailAccount'
import { passwordSchema } from './accounts.js'
import { tokenHash } from './sessions.js'
import { createAuthRateLimit } from './authRateLimit.js'
import type { registerAuthentication } from './auth.js'
import type { PasswordWork } from './emailAuth.js'

export function registerEmailBinding(app: FastifyInstance, pool: Pool,
  authorize: Awaited<ReturnType<typeof registerAuthentication>>, origin: string, work: PasswordWork, clock: () => Date) {
  const allowed = createAuthRateLimit(pool, 'email_bind'), deliveries = new Set<Promise<void>>()
  app.addHook('onClose', async () => { await Promise.allSettled(deliveries) })
  app.get('/api/v1/auth/email', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const result = await pool.query<Record<string, unknown>>('SELECT email,email_verified_at IS NOT NULL AS verified FROM health.users WHERE id=$1', [account.id])
    return z.object({ email: emailAddress.nullable(), verified: z.boolean() }).parse(result.rows[0])
  })
  app.post('/api/v1/auth/email/bind', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const mail = app.hasDecorator('accountMail') ? app.accountMail : null
    if (!mail) return reply.code(503).send({ error: { code: 'mail_unavailable', message: 'Почта временно недоступна' } })
    if (work.active >= 4 || !await allowed(request.ip, account.id, clock()) || work.active >= 4) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Повторите позже' } })
    const values = z.strictObject({ email: emailSchema, password: passwordSchema }).safeParse(request.body)
    const invalid = () => reply.code(400).send({ error: { code: 'invalid_data', message: 'Проверьте почту и текущий пароль' } })
    if (!values.success) return invalid()
    work.active++
    try {
      const stored = await pool.query<Record<string, unknown>>('SELECT password_hash FROM health.users WHERE id=$1', [account.id])
      const encoded = z.object({ password_hash: z.string() }).parse(stored.rows[0]).password_hash
      if (!await verify(encoded, values.data.password)) return await invalid()
      const token = randomBytes(32).toString('hex')
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM health.begin_email_binding($1,$2,$3,$4,$5)',
        [account.id, values.data.email, encoded, tokenHash(token), clock()])
      const destination = z.array(z.object({ email: emailAddress })).parse(result.rows)[0]?.email
      if (destination) {
        const delivery = mail.send({ to: destination, subject: 'Подтвердите почту дневника',
          text: `Для привязки почты задайте пароль по ссылке:\n${origin}/#auth=verify_email&token=${token}\n\nСсылка действует 1 час. После подтверждения все устройства выйдут из аккаунта. Если вы не запрашивали привязку, ничего делать не нужно.`,
        }).catch(() => { /* No recipient or SMTP details in API/logs. */ })
        deliveries.add(delivery); void delivery.finally(() => { deliveries.delete(delivery) })
      }
      return await reply.code(202).send({ accepted: true })
    } finally { work.active-- }
  })
}

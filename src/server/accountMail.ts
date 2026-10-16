import nodemailer from 'nodemailer'
import { z } from 'zod'
import { emailAddress } from '../domain/emailAccount'

const sender = 'no-reply@auth.arturican.com'
const configSchema = z.object({
  MAIL_ENABLED: z.enum(['true', 'false']).default('false'),
  MAIL_SMTP_PORT: z.string().regex(/^[0-9]{1,5}$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(25),
})
const messageSchema = z.object({
  to: emailAddress,
  subject: z.string().min(1).max(120).refine(value => !/\p{Cc}/u.test(value)),
  text: z.string().min(1).max(8192).refine(value => !value.includes(String.fromCharCode(0))),
}).strict()

export interface AccountMailer {
  send(message: unknown): Promise<void>
  close(): Promise<void>
}

declare module 'fastify' {
  interface FastifyInstance { accountMail: AccountMailer | null }
}

export function createAccountMailer(environment: Record<string, string | undefined>): AccountMailer | null {
  const parsed = configSchema.safeParse(environment)
  if (!parsed.success) throw new Error('Некорректные настройки почты')
  if (parsed.data.MAIL_ENABLED === 'false') return null
  const transport = nodemailer.createTransport({
    host: '127.0.0.1', port: parsed.data.MAIL_SMTP_PORT, name: 'auth.arturican.com',
    secure: false, ignoreTLS: true, pool: false,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    logger: false, debug: false, transactionLog: false,
    disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1,
  })
  const pending = new Set<Promise<void>>()
  let closed = false
  return {
    async send(input) {
      const parsed = messageSchema.safeParse(input)
      if (!parsed.success) throw new Error('Некорректное служебное письмо')
      if (closed || pending.size >= 4) throw new Error('Отправка письма недоступна')
      const message = parsed.data
      const delivery = (async () => {
        try {
          await transport.sendMail({
            from: { address: sender, name: 'Дневник здоровья' },
            to: { address: message.to, name: '' },
            envelope: { from: sender, to: [message.to] },
            subject: message.subject, text: message.text, textEncoding: 'base64',
          })
        } catch { throw new Error('Не удалось отправить письмо') }
      })()
      pending.add(delivery)
      try { await delivery } finally { pending.delete(delivery) }
    },
    async close() {
      closed = true
      await Promise.allSettled(pending)
      transport.close()
    },
  }
}

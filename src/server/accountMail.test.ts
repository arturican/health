// @vitest-environment node
import nodemailer from 'nodemailer'
import { afterEach, expect, it, vi } from 'vitest'
import { createAccountMailer, type AccountMailer } from './accountMail'
import { accountMailSmtp } from '../../tests/accountMailSmtp'
import { startApi } from './runtime'

const message = { to: 'Synthetic.User+tag@example.test', subject: 'Подтверждение почты', text: 'Синтетическое письмо.\nТолько проверка SMTP.' }
let smtp: Awaited<ReturnType<typeof accountMailSmtp>> | undefined
let mail: AccountMailer | null = null
afterEach(async () => { await smtp?.close(); await mail?.close(); smtp = undefined; mail = null })
async function setup(mode: Parameters<typeof accountMailSmtp>[0] = 'ok') {
  smtp = await accountMailSmtp(mode)
  const service = createAccountMailer({ MAIL_ENABLED: 'true', MAIL_SMTP_PORT: String(smtp.port) })
  if (!service) throw new Error('Нет тестового транспорта')
  mail = service
  return { smtp, mail: service }
}
async function expectMailError(promise: Promise<void>, message: string) {
  const error: unknown = await promise.catch((value: unknown) => value)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('message', message)
  expect(error).not.toHaveProperty('cause')
  expect(Object.getOwnPropertyNames(error)).toEqual(['stack', 'message'])
}

it('без явного включения не создаёт транспорт и не подключается к SMTP', () => {
  const create = vi.spyOn(nodemailer, 'createTransport')
  expect(createAccountMailer({})).toBeNull()
  expect(createAccountMailer({ MAIL_ENABLED: 'false' })).toBeNull()
  expect(create).not.toHaveBeenCalled()
})

it.each([{ MAIL_ENABLED: 'yes' }, { MAIL_ENABLED: '' }, { MAIL_SMTP_PORT: '0' },
  { MAIL_SMTP_PORT: '65536' }, { MAIL_SMTP_PORT: '-1' }, { MAIL_SMTP_PORT: '25x' },
  { MAIL_SMTP_PORT: '2.5' }, { MAIL_SMTP_PORT: '' }])('отклоняет неверные настройки без их раскрытия: %j', environment => {
  expect(() => createAccountMailer(environment)).toThrow('Некорректные настройки почты')
})

it('фиксирует loopback, отсутствие логов/вложений и конечные SMTP-таймауты', async () => {
  const create = vi.spyOn(nodemailer, 'createTransport')
  mail = createAccountMailer({ MAIL_ENABLED: 'true' })
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    host: '127.0.0.1', port: 25, secure: false, ignoreTLS: true, pool: false,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    logger: false, debug: false, transactionLog: false,
    disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1,
  }))
  await mail?.close()
})

it('передаёт один envelope recipient и текст UTF-8 настоящим SMTP-диалогом', async () => {
  const { smtp, mail } = await setup()
  await expect(mail.send(message)).resolves.toBeUndefined()
  expect(smtp.commands.filter(line => line.startsWith('MAIL FROM:'))).toEqual(['MAIL FROM:<no-reply@auth.arturican.com>'])
  expect(smtp.commands.filter(line => line.startsWith('RCPT TO:'))).toEqual([`RCPT TO:<${message.to}>`])
  expect(smtp.commands.some(line => /STARTTLS|AUTH/.test(line))).toBe(false)
  expect(smtp.messages).toHaveLength(1)
  const raw = smtp.messages[0] ?? ''
  expect(raw).toMatch(/Content-Type: text\/plain; charset=utf-8/i)
  expect(raw).toMatch(/Content-Transfer-Encoding: base64/i)
  expect(raw).toMatch(/Subject: =\?UTF-8\?/i)
  expect(Buffer.from(raw.split('\r\n\r\n')[1] ?? '', 'base64').toString()).toBe(message.text)
})

it.each([null, {}, { ...message, to: ['a@example.test'] }, { ...message, to: 'a@example.test,b@example.test' },
  { ...message, to: 'Display <a@example.test>' }, { ...message, to: 'a@EXAMPLE.test' },
  { ...message, to: 'a@example.test\r\nBcc: other@example.test' }, { ...message, to: 'a'.repeat(65) + '@example.test' },
  { ...message, subject: '' }, { ...message, subject: 's'.repeat(121) }, { ...message, subject: 's\nBcc: other@example.test' },
  { ...message, subject: 's\u0001' }, { ...message, text: '' }, { ...message, text: 't'.repeat(8193) },
  { ...message, text: 't\u0000' }, { ...message, attachments: [{ path: '/etc/passwd' }] },
  { ...message, html: '<b>HTML</b>' }, { ...message, bcc: 'other@example.test' },
])('отклоняет неверное/расширенное письмо до сети', async input => {
  const { smtp, mail } = await setup()
  await expectMailError(mail.send(input), 'Некорректное служебное письмо')
  expect(smtp.commands).toEqual([])
})

it('принимает максимальные длины адреса, темы и текста', async () => {
  const { smtp, mail } = await setup()
  const to = 'a'.repeat(64) + '@' + 'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(61)
  await mail.send({ to, subject: 's'.repeat(120), text: 't'.repeat(8192) })
  expect(smtp.messages).toHaveLength(1)
})

it.each(['reject', 'disconnect'] as const)('скрывает SMTP %s, не повторяет письмо и освобождает слот', async mode => {
  const { smtp, mail } = await setup(mode)
  const log = vi.spyOn(console, 'log'), error = vi.spyOn(console, 'error')
  for (let attempt = 0; attempt < 5; attempt++) await expectMailError(mail.send(message), 'Не удалось отправить письмо')
  expect(smtp.commands.filter(line => line.startsWith('RCPT TO:'))).toHaveLength(5)
  smtp.setMode('ok')
  await mail.send(message)
  expect(smtp.messages).toHaveLength(1)
  expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
})

it('обрывает ожидание SMTP-приветствия с безопасной ошибкой', async () => {
  const { mail } = await setup('silent')
  await expectMailError(mail.send(message), 'Не удалось отправить письмо')
}, 10000)

it('при потере ответа после DATA не повторяет уже переданное письмо', async () => {
  const { smtp, mail } = await setup('hold')
  await expectMailError(mail.send(message), 'Не удалось отправить письмо')
  expect(smtp.messages).toHaveLength(1)
  expect(smtp.commands.filter(line => line === 'DATA')).toHaveLength(1)
}, 15000)

it('ограничивает параллельность четырьмя письмами и ждёт их при закрытии', async () => {
  const { smtp, mail } = await setup('hold')
  const sends = Array.from({ length: 4 }, () => mail.send(message))
  await expect(mail.send(message)).rejects.toThrow('Отправка письма недоступна')
  await smtp.waitForMessages(4)
  const closing = mail.close()
  await expect(mail.send(message)).rejects.toThrow('Отправка письма недоступна')
  smtp.release()
  await Promise.all(sends); await closing
  expect(smtp.messages).toHaveLength(4)
})

it.each(['true', 'false'])('API с MAIL_ENABLED=%s управляет сервисом без маршрута отправки', async enabled => {
  const { smtp } = await setup()
  const listener = await accountMailSmtp()
  const port = listener.port
  await listener.close()
  const app = await startApi({ NODE_ENV: 'test', API_PORT: String(port), MAIL_ENABLED: enabled, MAIL_SMTP_PORT: String(smtp.port) })
  try {
    await app.accountMail?.send(message)
    expect(app.accountMail === null).toBe(enabled === 'false')
    expect(smtp.messages).toHaveLength(enabled === 'true' ? 1 : 0)
    expect((await app.inject({ method: 'POST', url: '/api/v1/mail', payload: message })).statusCode).toBe(404)
  } finally { await app.close() }
  if (app.accountMail) await expect(app.accountMail.send(message)).rejects.toThrow('Отправка письма недоступна')
})

it('неверные настройки почты останавливают API безопасной ошибкой до listen', async () => {
  await expect(startApi({ MAIL_ENABLED: 'true', MAIL_SMTP_PORT: 'synthetic-secret' })).rejects.toThrow('Не удалось запустить API')
})

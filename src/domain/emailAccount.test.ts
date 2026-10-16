import { expect, it } from 'vitest'
import { emailSchema, emailCompletion, emailRegistration } from './emailAccount'

it('нормализует только пробелы по краям и домен, сохраняет локальный регистр/+tag/точки', () => {
  expect(emailSchema.parse(' Synthetic.User+tag@EXAMPLE.TEST ')).toBe('Synthetic.User+tag@example.test')
})
it.each(['', 'example.test', 'a@localhost', '.a@example.test', 'a..b@example.test', 'a@example.test,b@example.test',
  'a@-example.test', 'a@' + 'a'.repeat(64) + '.test', 'имя@example.test', 'a@[127.0.0.1]', '"a"@example.test',
  'a'.repeat(65) + '@example.test', 'a@example.test\r\nBcc: b@example.test'])('отклоняет неверный email: %s', input => {
  expect(emailSchema.safeParse(input).success).toBe(false)
})
it('проверяет обязательные поля и не принимает дополнительные права/короткий пароль', () => {
  expect(emailRegistration.safeParse({ email: 'a@example.test' }).success).toBe(false)
  expect(emailRegistration.safeParse({ email: 'a@example.test', timezone: 'UTC', role: 'admin' }).success).toBe(false)
  expect(emailCompletion.safeParse({ token: 'a'.repeat(64), purpose: 'reset_password', password: 'short' }).success).toBe(false)
})

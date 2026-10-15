// @vitest-environment node
import { verify } from 'argon2'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createAccount, hashPassword, passwordSchema, timezoneSchema } from './accounts'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
beforeEach(async () => { database = await testDatabase(); await migrate(database.pool, await readMigrations()) })
afterEach(async () => { await database.close() })
const input = { login: ' Demo ', password: 'synthetic-only-password', timezone: 'Europe/Moscow' }

it('сохраняет Argon2id вместо пароля и возвращает только публичные поля', async () => {
  const account = await createAccount(database.pool, input)
  expect(account.id).toMatch(/^[a-f0-9-]{36}$/)
  expect(account).toEqual({ id: account.id, login: 'demo', timezone: 'Europe/Moscow' })
  const result = await database.pool.query<Record<string, unknown>>('SELECT password_hash FROM health.users WHERE id = $1', [account.id])
  const encoded = result.rows[0]?.password_hash
  expect(typeof encoded).toBe('string')
  if (typeof encoded !== 'string') throw new Error('Нет хеша')
  expect(encoded.split('$').slice(1, 3)).toEqual(['argon2id', 'v=19'])
  expect(encoded.split('$')[3]?.split(',').sort()).toEqual(['m=19456', 'p=1', 't=2'])
  expect(encoded).not.toContain(input.password)
  expect(await verify(encoded, input.password)).toBe(true)
  expect(await verify(encoded, input.password + 'wrong')).toBe(false)
})

it('использует уникальную соль и сохраняет пробелы пароля', async () => {
  const first = await hashPassword('  synthetic-password  ')
  const second = await hashPassword('  synthetic-password  ')
  expect(first).not.toBe(second)
  expect(await verify(first, '  synthetic-password  ')).toBe(true)
  expect(await verify(first, 'synthetic-password')).toBe(false)
})

it('не меняет существующий аккаунт при повторе нормализованного логина', async () => {
  await createAccount(database.pool, input)
  const before = (await database.pool.query('SELECT * FROM health.users')).rows
  await expect(createAccount(database.pool, { ...input, login: 'DEMO', password: 'different-test-password' })).rejects.toThrow('уже существует')
  expect((await database.pool.query('SELECT * FROM health.users')).rows).toEqual(before)
})

it.each([null, {}, { ...input, password: 'short' }, { ...input, password: 'x'.repeat(1025) }, { ...input, timezone: 'Europe/Unknown' }, { ...input, login: 'bad name' }, { ...input, id: 'injected' }])('не записывает неверный ввод', async value => {
  await expect(createAccount(database.pool, value)).rejects.toThrow('Проверьте логин, пароль и часовой пояс аккаунта')
  expect((await database.pool.query('SELECT id FROM health.users')).rowCount).toBe(0)
})

it('принимает границы пароля и валидные IANA зоны', () => {
  for (const size of [15, 1024]) expect(passwordSchema.safeParse('x'.repeat(size)).success).toBe(true)
  for (const zone of ['UTC', 'Europe/Moscow', 'Etc/GMT+3']) expect(timezoneSchema.safeParse(zone).success).toBe(true)
  for (const zone of ['', '+03:00', 'Mars/Base']) expect(timezoneSchema.safeParse(zone).success).toBe(false)
})

it('не даёт runtime-роли создавать аккаунты', async () => {
  await expect(createAccount(database.runtime, input)).rejects.toMatchObject({ code: '42501' })
})

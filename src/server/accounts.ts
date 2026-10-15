import { randomUUID } from 'node:crypto'
import { argon2id, hash } from 'argon2'
import type { Pool } from 'pg'
import { z } from 'zod'
import { accountSchema, loginSchema, timezoneSchema, type Account } from '../domain/session'
export { accountSchema, loginSchema, timezoneSchema, type Account } from '../domain/session'

export const passwordSchema = z.string().min(15).max(1024)
const inputSchema = z.strictObject({ login: loginSchema, password: passwordSchema, timezone: timezoneSchema })

export async function hashPassword(password: string): Promise<string> {
  return hash(passwordSchema.parse(password), { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
}

export async function createAccount(pool: Pool, input: unknown): Promise<Account> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new Error('Проверьте логин, пароль и часовой пояс аккаунта')
  const { login, password, timezone } = parsed.data
  const passwordHash = await hashPassword(password)
  const result = await pool.query<Record<string, unknown>>(`
    INSERT INTO health.users(id, login, password_hash, timezone) VALUES ($1, $2, $3, $4)
    ON CONFLICT (login) DO NOTHING RETURNING id, login, timezone`, [randomUUID(), login, passwordHash, timezone])
  if (!result.rows[0]) throw new Error('Аккаунт с таким логином уже существует')
  return accountSchema.parse(result.rows[0])
}

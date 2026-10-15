import { randomUUID } from 'node:crypto'
import { argon2id, hash } from 'argon2'
import type { Pool } from 'pg'
import { z } from 'zod'

export const loginSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,63}$/)
export const passwordSchema = z.string().min(15).max(1024)
export const timezoneSchema = z.string().max(80).refine(value => {
  if (!/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value)) return false
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true }
  catch { return false }
})
export const accountSchema = z.strictObject({ id: z.uuid(), login: loginSchema, timezone: timezoneSchema })
const inputSchema = z.strictObject({ login: loginSchema, password: passwordSchema, timezone: timezoneSchema })
export type Account = z.infer<typeof accountSchema>

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

import { createHash, randomBytes } from 'node:crypto'
import { verify } from 'argon2'
import type { Pool } from 'pg'
import { z } from 'zod'
import { accountSchema, hashPassword, passwordSchema, type Account } from './accounts.js'
import { loginIdentity } from '../domain/emailAccount'

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/)
const credentialsSchema = z.strictObject({ login: loginIdentity, password: passwordSchema })
const storedAccountSchema = accountSchema.extend({ password_hash: z.string() })
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export const csrfToken = (token: string) => createHash('sha256').update(`csrf:${token}`).digest('hex')

export async function createSessions(pool: Pool, verifyPassword: (encoded: string, password: string) => Promise<boolean> = verify) {
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'))

  return {
    async login(input: unknown, previousToken: unknown, now: Date): Promise<{ token: string; account: Account } | null> {
      const credentials = credentialsSchema.safeParse(input)
      if (!credentials.success) return null
      const result = await pool.query<Record<string, unknown>>(`SELECT id, login, timezone, password_hash FROM health.users
        WHERE (login=$1 AND NOT email_required) OR (lower(email)=lower($1) AND email_verified_at IS NOT NULL)`, [credentials.data.login])
      const stored = result.rows[0] ? storedAccountSchema.parse(result.rows[0]) : null
      const valid = await verifyPassword(stored?.password_hash ?? dummyHash, credentials.data.password)
      if (!stored || !valid) return null
      const account = accountSchema.parse({ id: stored.id, login: stored.login, timezone: stored.timezone })
      const token = randomBytes(32).toString('hex')
      const previous = tokenSchema.safeParse(previousToken)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const lock = await client.query<Record<string, unknown>>('SELECT health.lock_account_for_login($1,$2) AS ok', [account.id, stored.password_hash])
        if (!z.object({ ok: z.boolean() }).parse(lock.rows[0]).ok) { await client.query('ROLLBACK'); return null }
        await client.query('DELETE FROM health.sessions WHERE user_id = $1 AND (expires_at <= $2 OR revoked_at IS NOT NULL)', [account.id, now])
        if (previous.success) {
          await client.query('UPDATE health.sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL AND created_at <= $2', [tokenHash(previous.data), now])
        }
        await client.query(`INSERT INTO health.sessions(token_hash, user_id, created_at, expires_at, last_seen_at)
          VALUES ($1, $2, $3, $4, $3)`, [tokenHash(token), account.id, now, new Date(now.getTime() + SESSION_LIFETIME_MS)])
        await client.query('COMMIT')
        return { token, account }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally { client.release() }
    },

    async read(input: unknown, now: Date): Promise<Account | null> {
      const token = tokenSchema.safeParse(input)
      if (!token.success) return null
      const result = await pool.query<Record<string, unknown>>(`
        UPDATE health.sessions s SET last_seen_at = GREATEST(s.last_seen_at, $2)
        FROM health.users u WHERE s.token_hash = $1 AND s.user_id = u.id
          AND s.revoked_at IS NULL AND s.expires_at > $2 AND s.created_at <= $2
          AND (NOT u.email_required OR u.email_verified_at IS NOT NULL)
          AND s.last_seen_at > $3 RETURNING u.id, u.login, u.timezone`,
      [tokenHash(token.data), now, new Date(now.getTime() - SESSION_IDLE_MS)])
      return result.rows[0] ? accountSchema.parse(result.rows[0]) : null
    },

    async logout(input: unknown, now: Date): Promise<void> {
      const token = tokenSchema.safeParse(input)
      if (!token.success) return
      await pool.query('UPDATE health.sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL AND created_at <= $2', [tokenHash(token.data), now])
    },
  }
}

export type Sessions = Awaited<ReturnType<typeof createSessions>>

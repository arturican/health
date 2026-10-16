import type { Pool } from 'pg'
import { z } from 'zod'
import { accountSchema, hashPassword, loginSchema, passwordSchema, timezoneSchema } from './accounts.js'

export const registrationSchema = z.strictObject({ login: loginSchema, password: passwordSchema, timezone: timezoneSchema })

export async function registerAccount(pool: Pool, input: unknown) {
  const values = registrationSchema.parse(input)
  const encoded = await hashPassword(values.password)
  const result = await pool.query<Record<string, unknown>>(
    'SELECT * FROM health.register_account($1, $2, $3)', [values.login, encoded, values.timezone])
  return result.rows[0] ? accountSchema.parse(result.rows[0]) : null
}

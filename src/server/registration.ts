import type { Pool } from 'pg'
import { accountSchema, hashPassword } from './accounts.js'
import { registrationSchema } from '../domain/registration'
export { registrationSchema } from '../domain/registration'

// Separate from login attempts; proxy IP is deliberately not trusted.
export function createRegistrationLimit() {
  const entries = new Map<string, { count: number; until: number }>()
  return (ip: string, now: number) => {
    for (const [key, entry] of entries) if (entry.until <= now) entries.delete(key)
    let entry = entries.get(ip)
    if (!entry) {
      if (entries.size >= 10000) return false
      entry = { count: 0, until: now + 15 * 60 * 1000 }
      entries.set(ip, entry)
    }
    if (entry.count >= 10) return false
    entry.count++
    return true
  }
}

export async function registerAccount(pool: Pool, input: unknown) {
  const values = registrationSchema.parse(input)
  const encoded = await hashPassword(values.password)
  const result = await pool.query<Record<string, unknown>>(
    'SELECT * FROM health.register_account($1, $2, $3)', [values.login, encoded, values.timezone])
  return result.rows[0] ? accountSchema.parse(result.rows[0]) : null
}

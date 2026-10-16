import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import { z } from 'zod'

type Bucket = 'login' | 'email_issue' | 'email_bind' | 'email_complete'

export function createAuthRateLimit(pool: Pool, bucket: Bucket) {
  const digest = (value: string) => createHash('sha256').update(`${bucket}:${value}`).digest('hex')
  return async (ip: string, identity: string | null, now: Date): Promise<boolean> => {
    const result = await pool.query<Record<string, unknown>>('SELECT health.take_auth_attempt($1,$2,$3,$4) AS allowed',
      [bucket, digest(ip), identity === null ? null : digest(identity), now])
    return z.object({ allowed: z.boolean() }).parse(result.rows[0]).allowed
  }
}

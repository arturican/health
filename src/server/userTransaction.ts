import type { Pool, PoolClient } from 'pg'
import { accountSchema, type Account } from './accounts.js'

export async function withUser<T>(pool: Pool, account: Account, work: (client: PoolClient) => Promise<T>, write = false): Promise<T> {
  const owner = accountSchema.parse(account)
  const client = await pool.connect()
  let reusable = true
  try {
    await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query("SELECT set_config('health.user_id', $1, true), set_config('TimeZone', $2, true)", [owner.id, owner.timezone])
    if (write) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [owner.id])
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { reusable = false }
    throw error
  } finally { client.release(!reusable) }
}

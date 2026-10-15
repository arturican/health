import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { entityId } from '../domain/schema'
import { DataError, inputValue } from './httpErrors.js'

// Вызывается внутри сериализованной write-транзакции владельца.
export async function runCommand<T>(client: PoolClient, owner: string, idInput: unknown, request: unknown, schema: z.ZodType<T>, work: () => Promise<T>): Promise<T> {
  const id = inputValue(() => entityId.parse(idInput))
  const hash = createHash('sha256').update(JSON.stringify(z.json().parse(request))).digest('hex')
  const previous = await client.query<Record<string, unknown>>('SELECT request_hash,response FROM health.commands WHERE id=$1', [id])
  if (previous.rows[0]) {
    const row = z.object({ request_hash: z.string(), response: z.unknown() }).parse(previous.rows[0])
    if (row.request_hash !== hash) throw new DataError(409)
    return schema.parse(row.response)
  }
  const result = schema.parse(await work())
  const count = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count FROM health.commands')
  if (z.object({ count: z.coerce.number() }).parse(count.rows[0]).count >= BACKUP_MAX_RECORDS) throw new DataError(400)
  const inserted = await client.query('INSERT INTO health.commands(user_id,id,request_hash,response) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,id) DO NOTHING',
    [owner, id, hash, JSON.stringify(z.json().parse(result))])
  if (inserted.rowCount !== 1) throw new DataError(409)
  return result
}

import type { FastifyInstance } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { attachmentMimes, attachmentPurposeSchema } from '../domain/attachment'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { entityId } from '../domain/schema'
import { FILE_STORAGE_MAX_BYTES } from '../domain/storedFile'
import type { validateServerAttachment } from './attachmentValidation.js'
import type { registerAuthentication } from './auth.js'
import { DataError, inputValue } from './httpErrors.js'
import { withUser } from './userTransaction.js'

export async function insertFile(client: PoolClient, owner: string, id: string, file: Awaited<ReturnType<typeof validateServerAttachment>>) {
  entityId.parse(id)
  if ((await client.query('SELECT 1 FROM health.files WHERE id=$1', [id])).rowCount !== 0) throw new DataError(409)
  const result = await client.query<Record<string, unknown>>('SELECT count(*)::text AS count,coalesce(sum(size),0)::text AS size FROM health.files')
  const current = z.object({ count: z.coerce.number(), size: z.coerce.number() }).parse(result.rows[0])
  if (current.count >= BACKUP_MAX_RECORDS || current.size + file.size > FILE_STORAGE_MAX_BYTES) throw new DataError(400)
  await client.query('INSERT INTO health.files(user_id,id,purpose,mime,size,bytes) VALUES ($1,$2,$3,$4,$5,$6)',
    [owner, id, file.purpose, file.mime, file.size, file.bytes])
}

export async function getFileRecord(client: PoolClient, idInput: unknown) {
  const id = inputValue(() => entityId.parse(idInput))
  const result = await client.query<Record<string, unknown>>('SELECT id,purpose,mime,size,bytes FROM health.files WHERE id=$1', [id])
  if (!result.rows[0]) throw new DataError(404)
  return z.object({ id: entityId, purpose: attachmentPurposeSchema, mime: z.enum(attachmentMimes),
    size: z.number().int().positive(), bytes: z.custom<Buffer>((value: unknown) => Buffer.isBuffer(value)),
  }).parse(result.rows[0])
}

export function registerFiles(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>) {
  app.get('/api/v1/files/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const { id } = inputValue(() => z.object({ id: entityId }).parse(request.params))
    const file = await withUser(pool, account, client => getFileRecord(client, id))
    const extension = file.mime === 'application/pdf' ? 'pdf' : file.mime.slice(6)
    return reply.type(file.mime).header('Content-Disposition', `attachment; filename="attachment-${id}.${extension}"`)
      .header('X-File-Purpose', file.purpose).header('Content-Security-Policy', "default-src 'none'; sandbox").send(file.bytes)
  })
}

import { createHash } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import type { AttachmentMime, AttachmentPurpose } from '../domain/attachment'
import type { Account } from './accounts.js'
import { validateServerAttachment } from './attachmentValidation.js'
import { withCommand } from './writeCommand.js'

type Upload = { bytes: unknown, metadata: unknown, purpose: AttachmentPurpose, mime: AttachmentMime }
type ValidatedFile = Awaited<ReturnType<typeof validateServerAttachment>>

export async function writeAttachmentCommand(pool: Pool, account: Account, request: FastifyRequest,
  upload: Upload, create: (client: PoolClient, file: ValidatedFile) => Promise<unknown>) {
  const file = await validateServerAttachment(upload.bytes, upload.purpose, upload.mime)
  const sha256 = createHash('sha256').update(file.bytes).digest('hex')
  return withCommand(pool, account, request, client => create(client, file), { metadata: upload.metadata, sha256 })
}

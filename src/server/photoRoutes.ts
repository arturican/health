import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { PHOTO_MAX_BYTES } from '../domain/attachment'
import { validateServerAttachment } from './attachmentValidation.js'
import type { registerAuthentication } from './auth.js'
import { inputValue } from './httpErrors.js'
import { createPhotoRecord, deletePhotoRecord, listPhotoRecords, readPhotoUpload, updatePhotoRecord } from './photoRecords.js'
import { diaryDate } from './recordValidation.js'
import type { createUploadTransport } from './uploadTransport.js'
import { withUser } from './userTransaction.js'
import { withCommand } from './writeCommand.js'

const routeId = (params: unknown) => inputValue(() => z.object({ id: z.string() }).parse(params).id)

export function registerPhotos(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, uploads: ReturnType<typeof createUploadTransport>, clock = () => new Date()) {
  app.get('/api/v1/photos', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => listPhotoRecords(client, request.query))
  })
  app.post('/api/v1/photos', { onRequest: uploads.onRequest, bodyLimit: PHOTO_MAX_BYTES }, async (request, reply) => {
    const record = await uploads.run(request, async (account, metadata, bytes) => {
      const values = readPhotoUpload(metadata, diaryDate(account.timezone, clock()))
      const file = await validateServerAttachment(bytes, 'photo', values.mime)
      return withCommand(pool, account, request, client => createPhotoRecord(client, account.id, values, file), { metadata, sha256: createHash('sha256').update(file.bytes).digest('hex') })
    })
    return reply.code(201).send(record)
  })
  app.put('/api/v1/photos/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withCommand(pool, account, request, client => updatePhotoRecord(client, routeId(request.params), request.body, diaryDate(account.timezone, clock())))
  })
  app.delete('/api/v1/photos/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    await withCommand(pool, account, request, client => deletePhotoRecord(client, routeId(request.params), request.body))
    return reply.code(204).send()
  })
}

import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { DOCUMENT_MAX_BYTES } from '../domain/attachment'
import { validateServerAttachment } from './attachmentValidation.js'
import type { registerAuthentication } from './auth.js'
import { countDocumentRecords, createDocumentRecord, deleteDocumentRecord, getDocumentRecord, listDocumentRecords, readDocumentUpload, updateDocumentRecord } from './documentRecords.js'
import { inputValue } from './httpErrors.js'
import { diaryDate } from './recordValidation.js'
import type { createUploadTransport } from './uploadTransport.js'
import { withUser } from './userTransaction.js'

const routeId = (params: unknown) => inputValue(() => z.object({ id: z.string() }).parse(params).id)

export function registerDocuments(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, uploads: ReturnType<typeof createUploadTransport>, clock = () => new Date()) {
  app.get('/api/v1/documents', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => listDocumentRecords(client, request.query))
  })
  app.get('/api/v1/documents/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => getDocumentRecord(client, routeId(request.params)))
  })
  app.get('/api/v1/documents/:id/results-count', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => countDocumentRecords(client, routeId(request.params)))
  })
  app.post('/api/v1/documents', { onRequest: uploads.onRequest, bodyLimit: DOCUMENT_MAX_BYTES }, async (request, reply) => {
    const record = await uploads.run(request, async (account, metadata, bytes) => {
      const values = readDocumentUpload(metadata, diaryDate(account.timezone, clock()))
      const file = await validateServerAttachment(bytes, 'document', values.mime)
      return withUser(pool, account, client => createDocumentRecord(client, account.id, values, file), true)
    })
    return reply.code(201).send(record)
  })
  app.put('/api/v1/documents/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => updateDocumentRecord(client, routeId(request.params), request.body, diaryDate(account.timezone, clock())), true)
  })
  app.delete('/api/v1/documents/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    await withUser(pool, account, client => deleteDocumentRecord(client, routeId(request.params), request.body), true)
    return reply.code(204).send()
  })
}

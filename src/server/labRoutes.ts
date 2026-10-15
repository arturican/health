import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { registerAuthentication } from './auth.js'
import { inputValue } from './httpErrors.js'
import { deleteLabRecord, listLabRecords, saveLabRecord } from './labRecords.js'
import { diaryDate } from './recordValidation.js'
import { withUser } from './userTransaction.js'
import { withCommand } from './writeCommand.js'

const routeId = (params: unknown) => inputValue(() => z.object({ id: z.string() }).parse(params).id)

export function registerLabs(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  app.get('/api/v1/lab-results', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => listLabRecords(client, request.query))
  })
  app.post('/api/v1/lab-results', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const record = await withCommand(pool, account, request, client => saveLabRecord(client, account.id, request.body, diaryDate(account.timezone, clock())))
    return reply.code(201).send(record)
  })
  app.put('/api/v1/lab-results/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withCommand(pool, account, request, client => saveLabRecord(client, account.id, request.body, diaryDate(account.timezone, clock()), routeId(request.params)))
  })
  app.delete('/api/v1/lab-results/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    await withCommand(pool, account, request, client => deleteLabRecord(client, routeId(request.params), request.body))
    return reply.code(204).send()
  })
}

import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { registerAuthentication } from './auth.js'
import { DataError, inputValue } from './httpErrors.js'
import { getProductRecord, listProductRecords, saveProductRecord } from './productRecords.js'
import { withUser } from './userTransaction.js'
import { withCommand } from './writeCommand.js'

const routeId = (params: unknown) => inputValue(() => z.object({ id: z.string() }).parse(params).id)

export function registerProducts(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>) {
  app.get('/api/v1/products', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => listProductRecords(client, request.query))
  })
  app.get('/api/v1/products/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const record = await withUser(pool, account, client => getProductRecord(client, routeId(request.params)))
    if (!record) throw new DataError(404)
    return record
  })
  app.post('/api/v1/products', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const record = await withCommand(pool, account, request, client => saveProductRecord(client, account.id, request.body))
    return reply.code(201).send(record)
  })
  app.put('/api/v1/products/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withCommand(pool, account, request, client => saveProductRecord(client, account.id, request.body, routeId(request.params)))
  })
}

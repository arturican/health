import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { registerAuthentication } from './auth.js'
import { inputValue } from './httpErrors.js'
import { diaryDate } from './recordValidation.js'
import { withUser } from './userTransaction.js'
import { withCommand } from './writeCommand.js'
import { createFoodRecord, deleteFoodRecord, listFoodRecords, updateFoodRecord } from './foodRecords.js'

const routeId = (params: unknown) => inputValue(() => z.object({ id: z.string() }).parse(params).id)

export function registerFood(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  app.get('/api/v1/food', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => listFoodRecords(client, request.query, diaryDate(account.timezone, clock())))
  })
  app.post('/api/v1/food', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const record = await withCommand(pool, account, request, client => createFoodRecord(client, account.id, request.body, diaryDate(account.timezone, clock())))
    return reply.code(201).send(record)
  })
  app.put('/api/v1/food/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withCommand(pool, account, request, client => updateFoodRecord(client, routeId(request.params), request.body, diaryDate(account.timezone, clock())))
  })
  app.delete('/api/v1/food/:id', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    await withCommand(pool, account, request, client => deleteFoodRecord(client, routeId(request.params), request.body))
    return reply.code(204).send()
  })
}

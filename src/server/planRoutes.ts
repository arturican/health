import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { registerAuthentication } from './auth.js'
import { inputValue } from './httpErrors.js'
import { diaryDate } from './recordValidation.js'
import { withUser } from './userTransaction.js'
import { createPlanRecord, effectivePlanRecord, listPlanRecords } from './planRecords.js'

export function registerPlans(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  app.get('/api/v1/energy-plans', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => listPlanRecords(client, request.query))
  })
  app.get('/api/v1/energy-plans/effective/:date', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const { date } = inputValue(() => z.object({ date: z.string() }).parse(request.params))
    return withUser(pool, account, client => effectivePlanRecord(client, date))
  })
  app.post('/api/v1/energy-plans', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const record = await withUser(pool, account, client => createPlanRecord(client, account.id, request.body, diaryDate(account.timezone, clock())), true)
    return reply.code(201).send(record)
  })
}

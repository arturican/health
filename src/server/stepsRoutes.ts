import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { registerAuthentication } from './auth.js'
import { inputValue } from './httpErrors.js'
import { diaryDate } from './recordValidation.js'
import { withUser } from './userTransaction.js'
import { withCommand } from './writeCommand.js'
import { deleteStepsRecord, getStepsRecord, listStepsRecords, saveStepsRecord } from './stepsRecords.js'

const routeDate = (params: unknown) => inputValue(() => z.object({ date: z.string() }).parse(params).date)

export function registerSteps(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  app.get('/api/v1/steps', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => listStepsRecords(client, request.query, diaryDate(account.timezone, clock())))
  })
  app.get('/api/v1/steps/:date', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => getStepsRecord(client, routeDate(request.params)))
  })
  app.put('/api/v1/steps/:date', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withCommand(pool, account, request, client => saveStepsRecord(client, account.id, routeDate(request.params), request.body, diaryDate(account.timezone, clock())))
  })
  app.delete('/api/v1/steps/:date', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    await withCommand(pool, account, request, client => deleteStepsRecord(client, routeDate(request.params), request.body))
    return reply.code(204).send()
  })
}

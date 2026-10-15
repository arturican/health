import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { registerAuthentication } from './auth.js'
import { createProfileRecord, getProfileRecord, updateProfileRecord } from './profileRecords.js'
import { diaryDate } from './recordValidation.js'
import { withUser } from './userTransaction.js'

export function registerProfile(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  app.get('/api/v1/profile', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => getProfileRecord(client, diaryDate(account.timezone, clock())))
  })
  app.post('/api/v1/profile', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const record = await withUser(pool, account, client => createProfileRecord(client, account.id, request.body, diaryDate(account.timezone, clock())), true)
    return reply.code(201).send(record)
  })
  app.put('/api/v1/profile', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => updateProfileRecord(client, account.id, request.body, diaryDate(account.timezone, clock())), true)
  })
}

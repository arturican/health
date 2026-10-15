import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { registerAuthentication } from './auth.js'
import { ensureDiaryState, saveSettings } from './diaryState.js'
import { withUser } from './userTransaction.js'
import { withCommand } from './writeCommand.js'

export function registerSettings(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>) {
  app.get('/api/v1/diary-state', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => ensureDiaryState(client, account.id), true)
  })
  app.put('/api/v1/settings', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withCommand(pool, account, request, client => saveSettings(client, account.id, request.body))
  })
}

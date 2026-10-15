import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { TEXT_BACKUP_MAX_BYTES } from '../domain/backup'
import type { registerAuthentication } from './auth.js'
import { createBackupTransport } from './backupTransport.js'
import { diaryDate } from './recordValidation.js'
import { backupJSON, readTextSnapshot } from './textSnapshot.js'
import { withUser } from './userTransaction.js'

export function registerBackups(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  const transport = createBackupTransport(app, authorize)
  app.get('/api/v1/backup/text', { onRequest: transport.onRequest }, async (request, reply) => {
    return transport.run(request, async account => {
      const now = clock(), today = diaryDate(account.timezone, now)
      const backup = await withUser(pool, account, client => readTextSnapshot(client, today, now.toISOString()))
      const text = backupJSON(backup, TEXT_BACKUP_MAX_BYTES)
      return reply.type('application/json').header('Content-Disposition', `attachment; filename="health-diary-text-${today}.json"`).send(text)
    })
  })
}

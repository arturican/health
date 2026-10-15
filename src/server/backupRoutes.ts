import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { TEXT_BACKUP_MAX_BYTES } from '../domain/backup'
import { FULL_BACKUP_MAX_BYTES } from '../domain/fullBackup'
import type { registerAuthentication } from './auth.js'
import { createBackupTransport } from './backupTransport.js'
import { diaryDate } from './recordValidation.js'
import { backupJSON, readTextSnapshot } from './textSnapshot.js'
import { withUser } from './userTransaction.js'
import { readFullSnapshot } from './fullSnapshot.js'

export function registerBackups(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  const transport = createBackupTransport(app, authorize)
  for (const format of ['text', 'full'] as const) app.get(`/api/v1/backup/${format}`, { onRequest: transport.onRequest }, async (request, reply) => {
    return transport.run(request, async account => {
      const now = clock(), today = diaryDate(account.timezone, now)
      const backup = await withUser(pool, account, async client => format === 'text'
        ? await readTextSnapshot(client, today, now.toISOString()) : await readFullSnapshot(client, today, now.toISOString()))
      const text = backupJSON(backup, format === 'text' ? TEXT_BACKUP_MAX_BYTES : FULL_BACKUP_MAX_BYTES)
      return reply.type('application/json').header('Content-Disposition', `attachment; filename="health-diary-${format}-${today}.json"`).send(text)
    })
  })
}

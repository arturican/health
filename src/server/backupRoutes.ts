import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { readTextBackup, TEXT_BACKUP_MAX_BYTES } from '../domain/backup'
import { FULL_BACKUP_MAX_BYTES } from '../domain/fullBackup'
import type { registerAuthentication } from './auth.js'
import { createBackupTransport } from './backupTransport.js'
import { diaryDate } from './recordValidation.js'
import { backupJSON, readTextSnapshot } from './textSnapshot.js'
import { withUser } from './userTransaction.js'
import { readFullSnapshot } from './fullSnapshot.js'
import { readImportBody, readImportHeaders } from './importRequest.js'
import { inputValue } from './httpErrors.js'
import { assertImportTarget, replaceTextSnapshot } from './restoreText.js'
import { withCommand } from './writeCommand.js'
import { prepareFullImport } from './prepareFullImport.js'
import { replaceFullSnapshot } from './restoreFull.js'

export function registerBackups(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  const transport = createBackupTransport(app, authorize)
  app.addContentTypeParser('application/vnd.health-diary+json', { parseAs: 'buffer' }, (_request, body, done) => { done(null, body) })
  for (const format of ['text', 'full'] as const) app.get(`/api/v1/backup/${format}`, { onRequest: transport.onRequest }, async (request, reply) => {
    return transport.run(request, async account => {
      const now = clock(), today = diaryDate(account.timezone, now)
      const backup = await withUser(pool, account, async client => format === 'text'
        ? await readTextSnapshot(client, today, now.toISOString()) : await readFullSnapshot(client, today, now.toISOString()))
      const text = backupJSON(backup, format === 'text' ? TEXT_BACKUP_MAX_BYTES : FULL_BACKUP_MAX_BYTES)
      return reply.type('application/json').header('Content-Disposition', `attachment; filename="health-diary-${format}-${today}.json"`).send(text)
    })
  })
  for (const format of ['text', 'full'] as const) app.post(`/api/v1/backup/${format}`, { bodyLimit: format === 'text' ? TEXT_BACKUP_MAX_BYTES : FULL_BACKUP_MAX_BYTES,
    onRequest: async (request, reply) => {
      await transport.onRequest(request, reply)
      if (!reply.sent) readImportHeaders(request)
    },
  }, async (request, reply) => transport.run(request, async account => {
    const mode = readImportHeaders(request)
    const { value, sha256 } = readImportBody(request.body)
    const today = diaryDate(account.timezone, clock())
    const prepared = format === 'full' ? await prepareFullImport(value, today) : null
    const backup = prepared?.backup.text ?? inputValue(() => readTextBackup(value, today))
    const result = await withCommand(pool, account, request, async client => {
      await assertImportTarget(client, mode)
      return prepared ? replaceFullSnapshot(client, account.id, prepared) : replaceTextSnapshot(client, account.id, backup)
    }, { mode, sha256 })
    return reply.send(result)
  }))
}

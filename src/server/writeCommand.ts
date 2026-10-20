import type { FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { entityId } from '../domain/schema'
import type { Account } from './accounts.js'
import { commandJournalNeedsRotation, runCommand } from './commands.js'
import { ensureDiaryState, readChangeRevision } from './diaryState.js'
import { CommandCapacityError, CommandRotationError, DataError, inputValue } from './httpErrors.js'
import { withUser } from './userTransaction.js'

export function requireConfirmation(request: FastifyRequest) {
  inputValue(() => {
    entityId.parse(request.headers['idempotency-key'])
    entityId.parse(request.headers['x-diary-generation'])
    readChangeRevision(request.headers['x-diary-revision'])
  })
}

export async function withCommand(pool: Pool, account: Account, request: FastifyRequest,
  work: (client: PoolClient) => Promise<unknown>, body: unknown = request.body ?? null): Promise<unknown> {
  const generation = inputValue(() => entityId.parse(request.headers['x-diary-generation']))
  const key = inputValue(() => entityId.optional().parse(request.headers['idempotency-key']))
  const revisionHeader = request.headers['x-diary-revision']
  const changeRevision = revisionHeader === undefined ? null : readChangeRevision(revisionHeader)
  const descriptor = { method: request.method, route: request.routeOptions.url, params: request.params ?? {}, generation, changeRevision, body }
  try {
    return await withUser(pool, account, async client => {
      const execute = async () => {
        const state = await ensureDiaryState(client, account.id)
        if (state.generation !== generation) throw new DataError(409)
        if (changeRevision !== null && state.changeRevision !== changeRevision) throw new DataError(409)
        const rotate = await commandJournalNeedsRotation(client)
        const changed = await client.query('UPDATE health.settings SET change_revision=change_revision+1 WHERE change_revision<9007199254740991')
        if (changed.rowCount !== 1) throw new DataError(409)
        const result = await work(client) ?? null
        if (rotate) throw new CommandCapacityError()
        return result
      }
      return key ? runCommand(client, account.id, key, descriptor, z.json(), async () => z.json().parse(await execute())) : execute()
    }, true)
  } catch (error) {
    if (!(error instanceof CommandCapacityError)) throw error
    // The failed business transaction has rolled back before maintenance acquires its lock.
    const rotated = await withUser(pool, account, async client => {
      const state = await ensureDiaryState(client, account.id)
      if (state.generation !== generation || !await commandJournalNeedsRotation(client)) return false
      await client.query('DELETE FROM health.commands WHERE user_id=$1', [account.id])
      const updated = await client.query('UPDATE health.settings SET generation=gen_random_uuid(),updated_at=now() WHERE user_id=$1', [account.id])
      if (updated.rowCount !== 1) throw new DataError(409)
      return true
    }, true)
    if (rotated) throw new CommandRotationError()
    throw new DataError(409)
  }
}

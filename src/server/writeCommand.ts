import type { FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { entityId } from '../domain/schema'
import type { Account } from './accounts.js'
import { runCommand } from './commands.js'
import { ensureDiaryState } from './diaryState.js'
import { DataError, inputValue } from './httpErrors.js'
import { withUser } from './userTransaction.js'

export async function withCommand(pool: Pool, account: Account, request: FastifyRequest,
  work: (client: PoolClient) => Promise<unknown>, body: unknown = request.body ?? null): Promise<unknown> {
  const generation = inputValue(() => entityId.parse(request.headers['x-diary-generation']))
  const key = inputValue(() => entityId.optional().parse(request.headers['idempotency-key']))
  const descriptor = { method: request.method, route: request.routeOptions.url, params: request.params ?? {}, generation, body }
  return withUser(pool, account, async client => {
    const execute = async () => {
      const state = await ensureDiaryState(client, account.id)
      if (state.generation !== generation) throw new DataError(409)
      return await work(client) ?? null
    }
    return key ? runCommand(client, account.id, key, descriptor, z.json(), async () => z.json().parse(await execute())) : execute()
  }, true)
}

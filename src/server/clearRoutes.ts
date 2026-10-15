import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { registerAuthentication } from './auth.js'
import { entityId } from '../domain/schema'
import { DataError, inputValue } from './httpErrors.js'
import { requireConfirmation, withCommand } from './writeCommand.js'

export function registerClear(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>) {
  app.delete('/api/v1/diary', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    requireConfirmation(request)
    inputValue(() => z.strictObject({ confirm: z.literal('delete-diary') }).parse(request.body))
    return withCommand(pool, account, request, async client => {
      // FORCE RLS и блокировка владельца действуют на всю транзакцию.
      for (const table of ['files', 'legacy_metadata', 'food_entries', 'products', 'profiles', 'nutrition_days', 'steps', 'workouts', 'energy_plans', 'commands']) {
        await client.query(`DELETE FROM health.${table}`)
      }
      const result = await client.query<Record<string, unknown>>(`UPDATE health.settings SET generation=gen_random_uuid(),
        show_photos=true,show_documents=true,visibility_defined=false,catalog_seeded=false,revision=revision+1,updated_at=now()
        WHERE revision<9007199254740991 RETURNING generation`)
      if (result.rowCount !== 1) throw new DataError(409)
      return z.object({ generation: entityId }).parse(result.rows[0])
    })
  })
}

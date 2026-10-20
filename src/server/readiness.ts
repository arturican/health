import type { FastifyInstance } from 'fastify'
import type { Pool, PoolClient } from 'pg'

export function registerReadiness(app: FastifyInstance, pool: Pool | null) {
  app.get('/api/v1/readiness', {
    schema: {
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['status'],
          properties: { status: { type: 'string', enum: ['ready'] } },
        },
        503: {
          type: 'object', additionalProperties: false, required: ['status'],
          properties: { status: { type: 'string', enum: ['unavailable'] } },
        },
      },
    },
  }, async (_request, reply) => {
    let ready = false
    let client: PoolClient | undefined
    try {
      if (pool) {
        client = await pool.connect()
        const probe = { text: 'SELECT 1', query_timeout: 1000 }
        await client.query(probe)
        ready = true
      }
    } catch {
      // Return dependency availability only, never connection or SQL details.
    } finally { client?.release(!ready) }
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' })
  })
}

// @vitest-environment node
import { request as httpRequest } from 'node:http'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { expect, it } from 'vitest'
import { createApi } from './app'
import { createUploadTransport } from './uploadTransport'
import { createBackupTransport } from './backupTransport'

function gate() {
  let release: () => void = () => { throw new Error('Gate is not initialized') }
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

it.each(['upload', 'backup-export', 'backup-import'] as const)('%s: disconnect during authorization leaves capacity available', async kind => {
  const app = createApi()
  const account = { id: '10000000-0000-4000-8000-000000000001', login: 'synthetic', timezone: 'UTC' }
  let entered = gate(), disconnected = gate(), resume = gate(), finished = gate()
  const authorize = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers['x-hold']) {
      reply.raw.once('close', () => { disconnected.release() })
      entered.release()
      await resume.promise
    }
    return account
  }
  const transport = kind === 'upload' ? createUploadTransport(app, authorize) : createBackupTransport(app, authorize)
  if (kind !== 'upload') app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => { done(null, body) })
  const method = kind === 'backup-export' ? 'GET' : 'POST'
  app.route({ method, url: '/transfer', onRequest: async (request, reply) => {
    await transport.onRequest(request, reply)
    if (request.headers['x-hold']) finished.release()
  }, handler: request => transport.run(request, () => Promise.resolve({ ok: true })) })
  const headers = { 'x-record': Buffer.from('{}').toString('base64url'), 'content-type': 'application/octet-stream' }
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 })
    for (let i = 0; i < (kind === 'upload' ? 2 : 1); i++) {
      entered = gate(); disconnected = gate(); resume = gate(); finished = gate()
      const client = httpRequest(address + '/transfer', { method, headers: { ...headers, 'x-hold': 'yes' } })
      // The reset is intentional; all requests stay on loopback.
      client.on('error', (error: Error) => { expect(error).toMatchObject({ code: 'ECONNRESET' }) })
      client.end()
      try {
        await entered.promise
        client.destroy()
        await disconnected.promise
      } finally { resume.release(); client.destroy() }
      await finished.promise
    }
    const response = await app.inject({ method, url: '/transfer', headers, ...(method === 'POST' ? { payload: Buffer.from('synthetic') } : {}) })
    expect(response.statusCode).toBe(200)
    expect(response.json<unknown>()).toEqual({ ok: true })
  } finally { resume.release(); await app.close() }
})

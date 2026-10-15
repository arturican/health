import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Account } from './accounts.js'
import type { registerAuthentication } from './auth.js'
import { inputValue } from './httpErrors.js'
import { deny } from './httpSecurity.js'

function readMetadata(value: unknown): unknown {
  return inputValue(() => {
    const encoded = z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/).parse(value)
    const bytes = Buffer.from(encoded, 'base64url')
    if (bytes.toString('base64url') !== encoded) throw new Error('Неканонические метаданные')
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return parsed
  })
}

export function createUploadTransport(app: FastifyInstance, authorize: Awaited<ReturnType<typeof registerAuthentication>>) {
  const pending = new WeakMap<FastifyRequest, { account: Account, metadata: unknown, started: boolean }>()
  let active = 0
  const release = (request: FastifyRequest) => { if (pending.delete(request)) active-- }
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => { done(null, body) })
  app.addHook('onResponse', (request, _reply, done) => { release(request); done() })
  app.addHook('onError', (request, _reply, _error, done) => { release(request); done() })
  app.addHook('onTimeout', (request, _reply, done) => { if (!pending.get(request)?.started) release(request); done() })
  return {
    onRequest: async (request: FastifyRequest, reply: FastifyReply) => {
      const account = await authorize(request, reply)
      if (!account) return
      if (active >= 2) return deny(reply, 429)
      const metadata = readMetadata(request.headers['x-record'])
      pending.set(request, { account, metadata, started: false })
      active++
      request.raw.once('aborted', () => { if (!pending.get(request)?.started) release(request) })
    },
    async run<T>(request: FastifyRequest, work: (account: Account, metadata: unknown, bytes: unknown) => Promise<T>): Promise<T> {
      const state = pending.get(request)
      if (!state) throw new Error('Загрузка не авторизована')
      state.started = true
      try { return await work(state.account, state.metadata, request.body) }
      finally { release(request) }
    },
  }
}

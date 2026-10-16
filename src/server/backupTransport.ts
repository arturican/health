import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Account } from './accounts.js'
import type { registerAuthentication } from './auth.js'
import { deny } from './httpSecurity.js'

export function createBackupTransport(app: FastifyInstance, authorize: Awaited<ReturnType<typeof registerAuthentication>>) {
  const pending = new WeakMap<FastifyRequest, { account: Account, reply: FastifyReply, running: boolean, disconnected: boolean }>()
  let busy = false
  const release = (request: FastifyRequest) => { if (pending.delete(request)) busy = false }
  app.addHook('onResponse', (request, _reply, done) => { release(request); done() })
  app.addHook('onError', (request, _reply, _error, done) => { release(request); done() })
  app.addHook('onTimeout', (request, _reply, done) => { if (!pending.get(request)?.running) release(request); done() })
  return {
    onRequest: async (request: FastifyRequest, reply: FastifyReply) => {
      const account = await authorize(request, reply)
      if (!account) return
      // Do not reserve capacity after missing an abort during authorization.
      if ((request.raw.destroyed && !request.raw.complete) || reply.raw.destroyed) return
      if (busy) return deny(reply, 429)
      const state = { account, reply, running: false, disconnected: false }
      pending.set(request, state)
      busy = true
      const disconnected = () => { state.disconnected = true; if (!state.running) release(request) }
      request.raw.once('aborted', disconnected)
      reply.raw.once('close', disconnected)
    },
    async run<T>(request: FastifyRequest, work: (account: Account) => Promise<T>): Promise<T> {
      const state = pending.get(request)
      if (!state) throw new Error('Копия не авторизована')
      state.running = true
      try { return await work(state.account) }
      finally {
        state.running = false
        if (state.disconnected || state.reply.raw.destroyed) release(request)
      }
    },
  }
}

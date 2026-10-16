import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { csrfToken, tokenSchema } from './sessions.js'

export const SESSION_COOKIE = '__Host-health_session'
export function sessionCookie(token: string, age: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${String(age)}`
}
export function readCookie(header: string | undefined): string | null {
  const matches = header?.split(';').map(value => value.trim()).filter(value => value.startsWith(`${SESSION_COOKIE}=`)) ?? []
  if (matches.length !== 1) return null
  const token = tokenSchema.safeParse(matches[0]?.slice(SESSION_COOKIE.length + 1))
  return token.success ? token.data : null
}
export function deny(reply: FastifyReply, status: 401 | 403 | 429) {
  const code = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'rate_limited'
  const message = status === 401 ? 'Войдите в аккаунт' : status === 403 ? 'Запрос отклонён' : 'Слишком много попыток. Повторите позже'
  return reply.code(status).send({ error: { code, message } })
}
export function installRequestProtection(app: FastifyInstance, origin: string) {
  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
    if (request.headers.origin !== origin) return deny(reply, 403)
    const path = request.url.split('?')[0]
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/register') return
    const token = readCookie(request.headers.cookie)
    if (!token) return path === '/api/v1/auth/logout' ? undefined : deny(reply, 401)
    const csrf = tokenSchema.safeParse(request.headers['x-csrf-token'])
    if (!csrf.success || !timingSafeEqual(Buffer.from(csrf.data, 'hex'), Buffer.from(csrfToken(token), 'hex'))) return deny(reply, 403)
  })
}

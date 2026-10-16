import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { loginIdentity } from '../domain/emailAccount'
import { createSessions, csrfToken, SESSION_LIFETIME_MS } from './sessions.js'
import { deny, installRequestProtection, readCookie, sessionCookie } from './httpSecurity.js'
import { createAuthRateLimit } from './authRateLimit.js'
import { registerEmailAuth } from './emailAuth.js'
import { registerEmailBinding } from './emailBinding.js'

export async function assertRuntimeRole(pool: Pool) {
  const rights = await pool.query<Record<string, unknown>>(`SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole
    OR has_schema_privilege(current_user, 'health', 'CREATE') OR has_table_privilege(current_user, 'health.users', 'INSERT') AS elevated
    FROM pg_roles WHERE rolname = current_user`)
  if (z.object({ elevated: z.boolean() }).parse(rights.rows[0]).elevated) throw new Error('API требует ограниченную роль БД')
}

export async function registerAuthentication(app: FastifyInstance, pool: Pool, origin: string, clock = () => new Date()) {
  await assertRuntimeRole(pool)
  const sessions = await createSessions(pool)
  const allowLogin = createAuthRateLimit(pool, 'login')
  const work = { active: 0 }
  installRequestProtection(app, origin)
  await registerEmailAuth(app, pool, origin, work, clock)

  async function authorize(request: FastifyRequest, reply: FastifyReply) {
    const account = await sessions.read(readCookie(request.headers.cookie), clock())
    if (!account) { await deny(reply, 401); return null }
    reply.header('X-Account-Id', account.id)
    return account
  }
  registerEmailBinding(app, pool, authorize, origin, work, clock)
  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = z.object({ login: loginIdentity }).safeParse(request.body)
    if (work.active >= 4 || !await allowLogin(request.ip, body.success ? body.data.login.toLowerCase() : 'invalid', clock()) || work.active >= 4) return deny(reply, 429)
    work.active++
    try {
      const session = await sessions.login(request.body, readCookie(request.headers.cookie), clock())
      if (!session) return await deny(reply, 401)
      reply.header('Set-Cookie', sessionCookie(session.token, SESSION_LIFETIME_MS / 1000))
      reply.header('X-Account-Id', session.account.id)
      return { account: session.account, csrf: csrfToken(session.token) }
    } finally { work.active-- }
  })
  app.get('/api/v1/auth/session', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    const token = readCookie(request.headers.cookie)
    return { account, csrf: token ? csrfToken(token) : null }
  })
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const account = await sessions.read(readCookie(request.headers.cookie), clock())
    if (account) reply.header('X-Account-Id', account.id)
    await sessions.logout(readCookie(request.headers.cookie), clock())
    return reply.header('Set-Cookie', sessionCookie('', 0)).code(204).send()
  })
  return authorize
}

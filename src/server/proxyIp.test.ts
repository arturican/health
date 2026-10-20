// @vitest-environment node
import { expect, it } from 'vitest'
import { createApi } from './app'
import { createAuthRateLimit } from './authRateLimit'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

it.each([
  { enabled: false, remote: '127.0.0.1', forwarded: '192.0.2.1', expected: '127.0.0.1' },
  { enabled: true, remote: '198.51.100.1', forwarded: '192.0.2.1', expected: '198.51.100.1' },
  { enabled: true, remote: '127.0.0.1', forwarded: '192.0.2.1', expected: '192.0.2.1' },
  { enabled: true, remote: '::1', forwarded: '2001:db8::1', expected: '2001:db8::1' },
  { enabled: true, remote: '::ffff:127.0.0.1', forwarded: '192.0.2.1', expected: '192.0.2.1' },
  { enabled: true, remote: '127.0.0.1', forwarded: '192.0.2.99, 127.0.0.1', expected: '127.0.0.1' },
])('определяет адрес только через ближайший доверенный hop: $remote / $enabled', async ({ enabled, remote, forwarded, expected }) => {
  const app = createApi(enabled)
  app.get('/ip', request => ({ ip: request.ip }))
  try {
    const response = await app.inject({ url: '/ip', remoteAddress: remote, headers: { 'x-forwarded-for': forwarded } })
    expect(response.json<unknown>()).toEqual({ ip: expected })
  } finally { await app.close() }
})

it('исчерпание IP-бюджета не блокирует другой адрес и не обходится левым префиксом цепочки', async () => {
  const database = await testDatabase()
  const app = createApi(true), allowed = createAuthRateLimit(database.runtime, 'login')
  let attempt = 0
  app.post('/limited', async (request, reply) => {
    if (!await allowed(request.ip, `synthetic-${String(attempt++)}`, new Date('2026-10-16T12:00:00Z'))) return reply.code(429).send()
    return { ok: true }
  })
  const send = (forwarded: string) => app.inject({ method: 'POST', url: '/limited', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': forwarded } })
  try {
    await migrate(database.pool, await readMigrations())
    for (let i = 0; i < 30; i++) expect((await send('192.0.2.1')).statusCode).toBe(200)
    expect((await send('192.0.2.99, 192.0.2.1')).statusCode).toBe(429)
    expect((await send('192.0.2.2')).statusCode).toBe(200)
  } finally { await app.close(); await database.close() }
})

import { vi } from 'vitest'
import { z } from 'zod'
import { testApi } from './serverApi'
import { registerSettings } from '../src/server/settingsRoutes'
import { setClientSession } from '../src/client/session'

/** Настоящие маршруты и SQL, транспорт fetch заменён только на Fastify inject. */
export async function clientApi(register: Parameters<typeof testApi>[0]) {
  const context = await testApi((app, pool, authorize, clock) => { registerSettings(app, pool, authorize); register(app, pool, authorize, clock) })
  let headers = await context.headers()
  const network = vi.fn<typeof fetch>(async (path, options) => {
    if (typeof path !== 'string') throw new Error('Тест ожидает относительный URL')
    const method = z.enum(['GET', 'POST', 'PUT', 'DELETE']).parse(options?.method ?? 'GET')
    const requestHeaders = Object.fromEntries(new Headers(options?.headers))
    const payload = options?.body === null || options?.body === undefined ? undefined : Buffer.from(await new Response(options.body).arrayBuffer())
    const result = await context.app.inject({ method, url: path, headers: { cookie: headers.cookie, origin: headers.origin, ...requestHeaders }, ...(payload ? { payload } : {}) })
    const responseHeaders = new Headers()
    for (const [key, value] of Object.entries(result.headers)) if (typeof value === 'string') responseHeaders.set(key, value)
    return new Response(result.statusCode === 204 ? null : Uint8Array.from(result.rawPayload), { status: result.statusCode, headers: responseHeaders })
  })
  vi.stubGlobal('fetch', network)
  async function signIn(login = 'alice') {
    headers = await context.headers(login)
    const session = await context.app.inject({ url: '/api/v1/auth/session', headers })
    const diary = await context.app.inject({ url: '/api/v1/diary-state', headers })
    setClientSession(session.json<unknown>(), diary.json<unknown>())
  }
  await signIn()
  return { ...context, network, signIn, async close() {
    setClientSession(null)
    vi.unstubAllGlobals()
    await context.close()
  } }
}

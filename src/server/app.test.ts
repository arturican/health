// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApi } from './app'

const diagnostics = vi.fn<(event: string) => void>()
let app: ReturnType<typeof createApi>
beforeEach(() => { diagnostics.mockClear(); app = createApi(false, diagnostics) })
afterEach(async () => { await app.close() })

it('возвращает только liveness без кеширования или cookie', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
  expect(response.statusCode).toBe(200)
  expect(response.json<unknown>()).toEqual({ status: 'ok' })
  expect(response.headers['content-type']).toMatch(/^application\/json/)
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect(response.headers['set-cookie']).toBeUndefined()
  expect(diagnostics).not.toHaveBeenCalled()
})

it.each(['GET', 'POST'] as const)('не открывает несуществующий API дневника и не отражает URL: %s', async method => {
  const response = await app.inject({ method, url: '/api/v1/weights?note=synthetic-private-text' })
  expect(response.statusCode).toBe(404)
  expect(response.json<unknown>()).toEqual({ error: { code: 'not_found', message: 'Маршрут не найден' } })
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.body).not.toContain('synthetic-private-text')
})

it.each([
  { label: 'испорченный JSON', type: 'application/json', payload: '{"synthetic-private-text":', status: 400, code: 'invalid_request' },
  { label: 'загрязнение прототипа', type: 'application/json', payload: '{"__proto__":{"synthetic-private-text":true}}', status: 400, code: 'invalid_request' },
  { label: 'слишком большое тело', type: 'application/json', payload: JSON.stringify({ value: 'Я'.repeat(9000) }), status: 413, code: 'payload_too_large' },
  { label: 'неподдерживаемый MIME', type: 'application/xml', payload: '<synthetic-private-text/>', status: 415, code: 'unsupported_media_type' },
])('ограничивает неверный запрос без раскрытия его содержимого: $label', async ({ type, payload, status, code }) => {
  app.post('/api/test-input', () => ({ accepted: true }))
  const response = await app.inject({ method: 'POST', url: '/api/test-input', headers: { 'content-type': type }, payload })
  expect(response.statusCode).toBe(status)
  expect(response.json<unknown>()).toEqual({ error: { code, message: 'Проверьте формат и размер запроса' } })
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect(response.body).not.toContain('synthetic-private-text')
})

it('скрывает неожиданные ошибки и stack trace', async () => {
  app.get('/api/test-fault', () => { throw new Error('synthetic-private-text') })
  const response = await app.inject({ method: 'GET', url: '/api/test-fault', headers: { authorization: 'Bearer synthetic-token', cookie: 'synthetic=session' } })
  expect(response.statusCode).toBe(500)
  expect(response.json<unknown>()).toEqual({ error: { code: 'internal_error', message: 'Не удалось выполнить запрос' } })
  expect(response.headers['cache-control']).toBe('no-store')
  expect(diagnostics).toHaveBeenCalledExactlyOnceWith('api_internal_error')
  for (const text of ['synthetic-private-text', 'synthetic-token', 'synthetic=session', 'stack']) expect(response.body).not.toContain(text)
})

it.each([{ bytes: 16384, status: 200 }, { bytes: 16385, status: 413 }])('проверяет точную границу тела в байтах: $bytes', async ({ bytes, status }) => {
  app.post('/api/test-input', () => ({ accepted: true }))
  const overhead = Buffer.byteLength(JSON.stringify({ value: '' }))
  const payload = JSON.stringify({ value: 'x'.repeat(bytes - overhead) })
  expect(Buffer.byteLength(payload)).toBe(bytes)
  const response = await app.inject({ method: 'POST', url: '/api/test-input', headers: { 'content-type': 'application/json' }, payload })
  expect(response.statusCode).toBe(status)
  expect(response.headers['cache-control']).toBe('no-store')
})

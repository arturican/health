// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { DOCUMENT_MAX_BYTES } from '../domain/attachment'
import { entityId } from '../domain/schema'
import { validateServerAttachment } from './attachmentValidation'
import { insertFile, registerFiles } from './fileRecords'
import { createUploadTransport } from './uploadTransport'
import { withUser } from './userTransaction'
import { csrfToken } from './sessions'
import { SESSION_COOKIE } from './httpSecurity'
import { inputValue } from './httpErrors'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
let hold: Promise<void> | null = null
let entered = 0
let onEntered: (() => void) | undefined
const bytes = Buffer.from('%PDF-1.7\n% Synthetic test only\n%%EOF\n')
const metadata = (id: string) => Buffer.from(JSON.stringify({ id })).toString('base64url')
beforeEach(async () => {
  hold = null; entered = 0; onEntered = undefined
  context = await testApi((app, pool, authorize) => {
    registerFiles(app, pool, authorize)
    const transport = createUploadTransport(app, authorize)
    // Тестовый потребитель транспорта; в production этот маршрут не регистрируется.
    app.post('/api/v1/test-upload', { onRequest: transport.onRequest, bodyLimit: DOCUMENT_MAX_BYTES }, request => transport.run(request, async (account, input, body) => {
      const { id } = inputValue(() => z.strictObject({ id: entityId }).parse(input))
      if (hold) { entered++; if (entered === 2) onEntered?.(); await hold }
      const file = await validateServerAttachment(body, 'document', 'application/pdf')
      await withUser(pool, account, client => insertFile(client, account.id, id, file), true)
      return { id }
    }))
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const upload = (id = randomUUID(), payload = bytes, ownHeaders = headers, record = metadata(id)) => context.app.inject({ method: 'POST', url: '/api/v1/test-upload', headers: { ...ownHeaders, 'content-type': 'application/octet-stream', 'x-record': record }, payload })

it('отдаёт исходные байты только владельцу с защитными заголовками', async () => {
  const id = randomUUID()
  expect((await upload(id)).statusCode).toBe(200)
  const response = await context.app.inject({ url: `/api/v1/files/${id}`, headers })
  expect(response.rawPayload).toEqual(bytes)
  expect(response.headers['content-type']).toBe('application/pdf')
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect(response.headers['content-disposition']).toContain('attachment;')
  expect(response.headers['content-security-policy']).toContain('sandbox')
  const bob = await context.headers('bob')
  expect((await context.app.inject({ url: `/api/v1/files/${id}`, headers: bob })).statusCode).toBe(404)
  expect((await context.app.inject({ url: `/api/v1/files/${id}` })).statusCode).toBe(401)
  expect((await upload(id)).statusCode).toBe(409)
})

it('проверяет сессию до большого тела и освобождает слот после 413/ошибки заголовка', async () => {
  const token = 'a'.repeat(64)
  const forged = { ...headers, cookie: `${SESSION_COOKIE}=${token}`, 'x-csrf-token': csrfToken(token) }
  const oversized = Buffer.alloc(DOCUMENT_MAX_BYTES + 1)
  expect((await upload(randomUUID(), oversized, forged)).statusCode).toBe(401)
  expect((await upload(randomUUID(), oversized)).statusCode).toBe(413)
  for (const record of ['e30=', 'a'.repeat(4097), Buffer.from([255]).toString('base64url'), Buffer.from('not-json').toString('base64url')]) {
    expect((await upload(randomUUID(), bytes, headers, record)).statusCode).toBe(400)
  }
  expect((await upload()).statusCode).toBe(200)
})

it('ограничивает две одновременные загрузки и освобождает слоты после завершения', async () => {
  let release: () => void = () => { throw new Error('Не создан gate') }
  hold = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { onEntered = resolve })
  const first = upload(), second = upload()
  const running = Promise.all([first, second])
  await ready
  try { expect((await upload()).statusCode).toBe(429) }
  finally { release() }
  expect((await running).map(response => response.statusCode)).toEqual([200, 200])
  hold = null
  expect((await upload()).statusCode).toBe(200)
})

it('отклоняет новую запись при квоте 100 MiB и не сохраняет повреждённый файл', async () => {
  await context.database.pool.query(`INSERT INTO health.files(user_id,id,purpose,mime,size,bytes)
    SELECT $1,gen_random_uuid(),'document','application/pdf',$2,convert_to(repeat('x',$2),'UTF8') FROM generate_series(1,5)`, [context.alice.id, DOCUMENT_MAX_BYTES])
  expect((await upload()).statusCode).toBe(400)
  expect((await context.database.pool.query('SELECT count(*)::text FROM health.files')).rows).toEqual([{ count: '5' }])
  const bob = await context.headers('bob')
  expect((await upload(randomUUID(), Buffer.from('invalid'), bob)).statusCode).toBe(400)
  expect((await upload(randomUUID(), bytes, bob)).statusCode).toBe(200)
})

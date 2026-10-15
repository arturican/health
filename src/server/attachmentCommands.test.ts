// @vitest-environment node
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { registerDocuments } from './documentRoutes'
import { registerPhotos } from './photoRoutes'
import { registerLabs } from './labRoutes'
import { createUploadTransport } from './uploadTransport'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
let pause: (() => Promise<void>) | undefined
const document = { id: randomUUID(), fileId: randomUUID(), date: '2026-10-15', title: 'Учебный документ', kind: 'lab', note: '', mime: 'application/pdf' }
const pdf = Buffer.from('%PDF-1.7\n% Synthetic report only\n%%EOF\n')
beforeEach(async () => {
  pause = undefined
  context = await testApi((app, pool, authorize, clock) => {
    app.addHook('preHandler', async request => { if (request.headers['content-type'] === 'application/octet-stream') await pause?.() })
    const uploads = createUploadTransport(app, authorize)
    registerDocuments(app, pool, authorize, uploads, clock)
    registerPhotos(app, pool, authorize, uploads, clock)
    registerLabs(app, pool, authorize, clock)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const upload = (route = 'documents', metadata: Record<string, unknown> = document, payload = pdf, ownHeaders = headers) => context.app.inject({ method: 'POST', url: `/api/v1/${route}`, headers: { ...ownHeaders, 'content-type': 'application/octet-stream', 'x-record': Buffer.from(JSON.stringify(metadata)).toString('base64url') }, payload })
function gate() {
  let release = () => { /* назначается синхронно конструктором Promise */ }
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

it('повторяет обе загрузки по хешу байтов и отклоняет другой файл с тем же ключом', async () => {
  const ownHeaders = { ...headers, 'idempotency-key': randomUUID() }
  const first = await upload('documents', document, pdf, ownHeaders)
  expect(first.statusCode).toBe(201)
  expect((await upload('documents', document, pdf, ownHeaders)).json<unknown>()).toEqual(first.json<unknown>())
  expect((await upload('documents', document, Buffer.from('%PDF-1.7\n% Another synthetic report\n%%EOF\n'), ownHeaders)).statusCode).toBe(409)
  const photo = { id: randomUUID(), fileId: randomUUID(), date: document.date, title: 'Геометрическое фото', note: '', mime: 'image/jpeg' }
  const jpeg = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#376890' } }).jpeg().toBuffer()
  const photoHeaders = { ...headers, 'idempotency-key': randomUUID() }
  const created = await upload('photos', photo, jpeg, photoHeaders)
  expect(created.statusCode).toBe(201)
  expect((await upload('photos', photo, jpeg, photoHeaders)).json<unknown>()).toEqual(created.json<unknown>())
  expect((await context.database.pool.query('SELECT * FROM health.files')).rowCount).toBe(2)
})

it('загрузка, отложенная до смены поколения, не возвращает файлы', async () => {
  const entered = gate(), released = gate()
  pause = async () => { entered.release(); await released.promise }
  const pending = upload().then(response => response)
  await entered.promise
  try { await context.database.pool.query('UPDATE health.settings SET generation=$1', [randomUUID()]) }
  finally { released.release() }
  expect((await pending).statusCode).toBe(409)
  for (const table of ['files', 'documents', 'commands']) expect((await context.database.pool.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
})

it('отклоняет устаревшие правки, удаления и показатели', async () => {
  await context.database.pool.query('UPDATE health.settings SET generation=$1', [randomUUID()])
  for (const route of ['photos', 'documents', 'lab-results']) for (const method of ['PUT', 'DELETE'] as const) {
    expect((await context.app.inject({ method, url: `/api/v1/${route}/${document.id}`, headers, payload: {} })).statusCode).toBe(409)
  }
  expect((await context.app.inject({ method: 'POST', url: '/api/v1/lab-results', headers, payload: {} })).statusCode).toBe(409)
})

it('повтор показателя не меняет версию источника, повтор удаления возвращает 204', async () => {
  await upload()
  const value = { id: randomUUID(), documentId: document.id, date: document.date, name: 'Учебный показатель', value: { type: 'text', text: 'Не обнаружено' }, unit: '', reference: '', note: '' }
  const commandHeaders = { ...headers, 'idempotency-key': randomUUID() }
  const create = () => context.app.inject({ method: 'POST', url: '/api/v1/lab-results', headers: commandHeaders, payload: { value, revision: null } })
  expect((await create()).statusCode).toBe(201)
  expect((await create()).statusCode).toBe(201)
  expect((await context.app.inject({ url: `/api/v1/documents/${document.id}/results-count`, headers })).json<unknown>()).toEqual({ count: 1, revision: 2 })
  const removeHeaders = { ...headers, 'idempotency-key': randomUUID() }
  const remove = () => context.app.inject({ method: 'DELETE', url: `/api/v1/documents/${document.id}`, headers: removeHeaders, payload: { revision: 2, expectedResults: 1 } })
  expect((await remove()).statusCode).toBe(204)
  expect((await remove()).statusCode).toBe(204)
  for (const table of ['files', 'documents', 'lab_results']) expect((await context.database.pool.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
})

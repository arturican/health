// @vitest-environment node
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { registerDocuments } from './documentRoutes'
import { registerFiles } from './fileRecords'
import { createUploadTransport } from './uploadTransport'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const bytes = Buffer.from('%PDF-1.7\n% Synthetic report only\n%%EOF\n')
const values = { id: '10000000-0000-4000-8000-000000000001', fileId: randomUUID(), date: '2026-10-15', title: 'Учебный бланк', kind: 'lab', note: '', mime: 'application/pdf' }
const document = { id: values.id, fileId: values.fileId, date: values.date, title: values.title, kind: values.kind, note: '' }
const changes = { date: values.date, title: 'Новая подпись', kind: 'report', note: 'Учебная заметка' }
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    const uploads = createUploadTransport(app, authorize)
    registerFiles(app, pool, authorize)
    registerDocuments(app, pool, authorize, uploads, clock)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const upload = (metadata: Record<string, unknown> = values, payload = bytes) => context.app.inject({ method: 'POST', url: '/api/v1/documents', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-record': Buffer.from(JSON.stringify(metadata)).toString('base64url') }, payload })
const edit = (value = changes, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/documents/${values.id}`, headers: ownHeaders, payload: { value, revision } })
const remove = (expectedResults: number | null = null, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'DELETE', url: `/api/v1/documents/${values.id}`, headers: ownHeaders, payload: { revision, expectedResults } })

it('сохраняет исходный PDF, повторяет загрузку, читает и правит карточку', async () => {
  const created = await upload()
  expect(created.statusCode).toBe(201)
  expect(created.json<unknown>()).toEqual({ value: document, revision: 1 })
  expect((await upload()).json<unknown>()).toEqual(created.json<unknown>())
  expect((await upload({ ...values, title: 'Другой запрос' })).statusCode).toBe(409)
  headers = await context.headers()
  expect((await context.app.inject({ url: `/api/v1/documents/${values.id}`, headers })).json<unknown>()).toEqual(created.json<unknown>())
  expect((await edit()).json<unknown>()).toEqual({ value: { ...document, ...changes }, revision: 2 })
  expect((await context.app.inject({ url: `/api/v1/files/${values.fileId}`, headers })).rawPayload).toEqual(bytes)
  expect((await remove(null, 2)).statusCode).toBe(204)
  expect((await context.app.inject({ url: `/api/v1/files/${values.fileId}`, headers })).statusCode).toBe(404)
})

it('требует актуальное подтверждение количества показателей перед каскадным удалением', async () => {
  await upload()
  await context.database.pool.query(`INSERT INTO health.lab_results(user_id,id,document_id,date,name,value_type,value_text,unit,reference,note)
    VALUES ($1,$2,$3,'2026-10-15','Учебный показатель','text','Не обнаружено','','','')`, [context.alice.id, randomUUID(), values.id])
  expect((await context.app.inject({ url: `/api/v1/documents/${values.id}/results-count`, headers })).json<unknown>()).toEqual({ count: 1, revision: 1 })
  expect((await remove()).statusCode).toBe(409)
  expect((await remove(0)).statusCode).toBe(409)
  expect((await remove(1, 2)).statusCode).toBe(409)
  expect((await remove(1)).statusCode).toBe(204)
  for (const table of ['files', 'documents', 'lab_results']) expect((await context.database.pool.query(`SELECT * FROM health.${table}`)).rowCount).toBe(0)
})

it('принимает исходное изображение, листает карточки и запрещает чужой доступ', async () => {
  await upload()
  const image = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#246890' } }).png().toBuffer()
  const second = { ...values, id: '20000000-0000-4000-8000-000000000001', fileId: randomUUID(), mime: 'image/png' }
  expect((await upload(second, image)).statusCode).toBe(201)
  expect((await context.app.inject({ url: `/api/v1/files/${second.fileId}`, headers })).rawPayload).toEqual(image)
  expect((await context.app.inject({ url: '/api/v1/documents?limit=1', headers })).json<unknown>()).toEqual({ items: [{ value: document, revision: 1 }], nextAfter: values.id })
  const bob = await context.headers('bob')
  for (const suffix of [values.id, `${values.id}/results-count`]) expect((await context.app.inject({ url: `/api/v1/documents/${suffix}`, headers: bob })).statusCode).toBe(404)
  expect((await edit(changes, 1, bob)).statusCode).toBe(404)
  expect((await remove(null, 1, bob)).statusCode).toBe(404)
  expect((await context.app.inject({ url: '/api/v1/documents', headers: bob })).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await context.app.inject({ url: '/api/v1/documents' })).statusCode).toBe(401)
})

it('проверяет ввод и сохраняет одну из конкурирующих правок', async () => {
  for (const patch of [{ date: '2026-10-16' }, { title: ' ' }, { kind: 'unknown' }, { mime: 'image/png' }, { user_id: context.bob.id }]) {
    expect((await upload({ ...values, ...patch })).statusCode).toBe(400)
  }
  await upload()
  const results = await Promise.all([edit(), edit({ ...changes, title: 'Другая правка' })])
  expect(results.map(result => result.statusCode).sort()).toEqual([200, 409])
})

it('ошибка вставки карточки откатывает файл и команду', async () => {
  await context.database.pool.query(`CREATE FUNCTION health.reject_document() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic document failure'; END $$;
    CREATE TRIGGER reject_document BEFORE INSERT ON health.documents FOR EACH ROW EXECUTE FUNCTION health.reject_document();`)
  const response = await upload()
  expect(response.statusCode).toBe(500)
  expect(response.body).not.toContain('synthetic document failure')
  expect((await context.database.pool.query('SELECT * FROM health.files')).rowCount).toBe(0)
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(0)
})

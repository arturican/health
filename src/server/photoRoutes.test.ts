// @vitest-environment node
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { PHOTO_MAX_BYTES } from '../domain/attachment'
import { registerPhotos } from './photoRoutes'
import { registerFiles } from './fileRecords'
import { createUploadTransport } from './uploadTransport'
import { testApi } from '../../tests/serverApi'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
let bytes: Buffer
const values = { id: '10000000-0000-4000-8000-000000000001', fileId: randomUUID(), date: '2026-10-15', title: 'Учебная геометрия', note: '', mime: 'image/jpeg' }
const photo = { id: values.id, fileId: values.fileId, date: values.date, title: values.title, note: '', width: 8, height: 6 }
const changes = { date: values.date, title: 'Новая подпись', note: 'Учебная заметка' }
beforeEach(async () => {
  bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#246890' } }).jpeg().toBuffer()
  context = await testApi((app, pool, authorize, clock) => {
    const uploads = createUploadTransport(app, authorize)
    registerFiles(app, pool, authorize)
    registerPhotos(app, pool, authorize, uploads, clock)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
const upload = (metadata: Record<string, unknown> = values, payload = bytes) => context.app.inject({ method: 'POST', url: '/api/v1/photos', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-record': Buffer.from(JSON.stringify(metadata)).toString('base64url') }, payload })
const edit = (value = changes, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/photos/${values.id}`, headers: ownHeaders, payload: { value, revision } })
const remove = (revision = 1, ownHeaders = headers) => context.app.inject({ method: 'DELETE', url: `/api/v1/photos/${values.id}`, headers: ownHeaders, payload: { revision } })

it('атомарно загружает фото, повторяет команду, правит метаданные и удаляет файл', async () => {
  const created = await upload()
  expect(created.statusCode).toBe(201)
  expect(created.json<unknown>()).toEqual({ value: photo, revision: 1 })
  expect((await upload()).json<unknown>()).toEqual(created.json<unknown>())
  expect((await context.database.pool.query('SELECT count(*)::text FROM health.files')).rows).toEqual([{ count: '1' }])
  expect((await upload({ ...values, title: 'Другой запрос' })).statusCode).toBe(409)
  headers = await context.headers()
  expect((await edit()).json<unknown>()).toEqual({ value: { ...photo, ...changes }, revision: 2 })
  expect((await context.app.inject({ url: `/api/v1/files/${values.fileId}`, headers })).rawPayload).toEqual(bytes)
  expect((await remove()).statusCode).toBe(409)
  expect((await remove(2)).statusCode).toBe(204)
  expect((await context.app.inject({ url: `/api/v1/files/${values.fileId}`, headers })).statusCode).toBe(404)
  expect((await upload()).statusCode).toBe(201)
  expect((await context.database.pool.query('SELECT * FROM health.files')).rowCount).toBe(0)
})

it('листает карточки и изолирует правку, удаление и байты от другого владельца', async () => {
  await upload()
  const second = { ...values, id: '20000000-0000-4000-8000-000000000001', fileId: randomUUID() }
  await upload(second)
  expect((await context.app.inject({ url: '/api/v1/photos?limit=1', headers })).json<unknown>()).toEqual({ items: [{ value: photo, revision: 1 }], nextAfter: values.id })
  expect((await context.app.inject({ url: `/api/v1/photos?limit=1&after=${values.id}`, headers })).json<unknown>()).toMatchObject({ items: [{ value: { id: second.id } }], nextAfter: null })
  const bob = await context.headers('bob')
  expect((await context.app.inject({ url: '/api/v1/photos', headers: bob })).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await edit(changes, 1, bob)).statusCode).toBe(404)
  expect((await remove(1, bob)).statusCode).toBe(404)
  expect((await context.app.inject({ url: `/api/v1/files/${values.fileId}`, headers: bob })).statusCode).toBe(404)
  expect((await context.app.inject({ url: '/api/v1/photos' })).statusCode).toBe(401)
})

it('проверяет даты, формат подготовленного фото, размер и конкурирующие ревизии', async () => {
  for (const patch of [{ date: '2026-10-16' }, { title: ' ' }, { mime: 'image/png' }, { width: 1 }, { user_id: context.bob.id }]) {
    expect((await upload({ ...values, ...patch })).statusCode).toBe(400)
  }
  expect((await upload(values, Buffer.alloc(PHOTO_MAX_BYTES + 1))).statusCode).toBe(413)
  expect((await upload(values, Buffer.from('invalid'))).statusCode).toBe(400)
  await upload()
  const results = await Promise.all([edit(), edit({ ...changes, title: 'Другая правка' })])
  expect(results.map(result => result.statusCode).sort()).toEqual([200, 409])
})

it('ошибка вставки карточки не оставляет файл или команду', async () => {
  await context.database.pool.query(`CREATE FUNCTION health.reject_photo() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic photo failure'; END $$;
    CREATE TRIGGER reject_photo BEFORE INSERT ON health.photos FOR EACH ROW EXECUTE FUNCTION health.reject_photo();`)
  const response = await upload()
  expect(response.statusCode).toBe(500)
  expect(response.body).not.toContain('synthetic photo failure')
  expect((await context.database.pool.query('SELECT * FROM health.files')).rowCount).toBe(0)
  expect((await context.database.pool.query('SELECT * FROM health.commands')).rowCount).toBe(0)
})

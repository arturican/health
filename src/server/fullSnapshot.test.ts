// @vitest-environment node
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { readFullBackup } from '../domain/fullBackup'
import { registerBackups } from './backupRoutes'
import { registerDocuments } from './documentRoutes'
import { registerPhotos } from './photoRoutes'
import { registerLabs } from './labRoutes'
import { registerSettings } from './settingsRoutes'
import { createUploadTransport } from './uploadTransport'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
let jpeg: Buffer
const document = { id: randomUUID(), fileId: randomUUID(), date: '2026-10-15', title: 'Учебный бланк', kind: 'lab', note: 'Синтетический PDF', mime: 'application/pdf' }
const photo = { id: randomUUID(), fileId: randomUUID(), date: document.date, title: 'Учебная геометрия', note: '', mime: 'image/jpeg' }
const pdf = Buffer.from('%PDF-1.7\n% Synthetic report only\n%%EOF\n')
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    const uploads = createUploadTransport(app, authorize)
    registerBackups(app, pool, authorize, clock)
    registerDocuments(app, pool, authorize, uploads, clock)
    registerPhotos(app, pool, authorize, uploads, clock)
    registerLabs(app, pool, authorize, clock)
    registerSettings(app, pool, authorize)
  })
  headers = await context.headers()
  jpeg = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#376890' } }).jpeg().toBuffer()
})
afterEach(async () => { await context.close() })
const upload = (route: string, metadata: Record<string, unknown>, payload: Buffer) => context.app.inject({ method: 'POST', url: `/api/v1/${route}`, headers: { ...headers, 'content-type': 'application/octet-stream', 'x-record': Buffer.from(JSON.stringify(metadata)).toString('base64url') }, payload })
const download = (ownHeaders = headers) => context.app.inject({ url: '/api/v1/backup/full', headers: ownHeaders })

it('экспортирует скрытые файлы, показатели и метаданные владельца с исходными байтами', async () => {
  expect((await upload('documents', document, pdf)).statusCode).toBe(201)
  expect((await upload('photos', photo, jpeg)).statusCode).toBe(201)
  const values = [{ type: 'number', number: -0.25, operator: 'lte' }, { type: 'text', text: 'Не обнаружено' }]
  for (const value of values) expect((await context.app.inject({ method: 'POST', url: '/api/v1/lab-results', headers, payload: {
    value: { id: randomUUID(), documentId: document.id, date: document.date, name: 'Учебный показатель', value, unit: '', reference: 'Как в бланке', note: '' }, revision: null,
  } })).statusCode).toBe(201)
  const visibility = { version: 1, showPhotos: false, showDocuments: false }
  expect((await context.app.inject({ method: 'PUT', url: '/api/v1/settings', headers, payload: { value: visibility, revision: 1 } })).statusCode).toBe(200)
  await context.database.pool.query('UPDATE health.settings SET catalog_seeded=true WHERE user_id=$1', [context.alice.id])
  for (const account of [context.alice, context.bob]) await context.database.pool.query('INSERT INTO health.legacy_metadata(user_id,id,value) VALUES ($1,$2,$3)', [account.id, 'synthetic-legacy', account.login])
  const response = await download()
  expect(response.statusCode).toBe(200)
  expect(response.headers['content-disposition']).toContain('health-diary-full-2026-10-15.json')
  expect(response.headers['cache-control']).toBe('no-store')
  const backup = readFullBackup(response.json<unknown>(), '2026-10-15')
  expect(backup.photos).toEqual([{ id: photo.id, fileId: photo.fileId, date: photo.date, title: photo.title, note: '', width: 2, height: 3 }])
  expect(backup.documents).toEqual([{ id: document.id, fileId: document.fileId, date: document.date, title: document.title, kind: 'lab', note: document.note }])
  expect(backup.files.find(file => file.id === photo.fileId)?.base64).toBe(jpeg.toString('base64'))
  expect(backup.files.find(file => file.id === document.fileId)?.base64).toBe(pdf.toString('base64'))
  expect(backup.labResults.map(result => result.value)).toEqual(expect.arrayContaining(values))
  expect(backup.labResults).toHaveLength(2)
  expect(backup.metadata).toHaveLength(3)
  expect(backup.metadata).toContainEqual({ id: 'synthetic-legacy', value: 'alice' })
  expect(backup.metadata).toContainEqual({ id: 'catalog-seeded', value: 'done' })
  const settings = backup.metadata.find(row => row.id === 'section-visibility')
  expect(settings && JSON.parse(settings.value)).toEqual(visibility)
  expect(response.body).not.toContain('generation')
  const other = readFullBackup((await download(await context.headers('bob'))).json<unknown>(), '2026-10-15')
  expect(other.metadata).toEqual([{ id: 'synthetic-legacy', value: 'bob' }])
  for (const rows of [other.photos, other.documents, other.labResults, other.files]) expect(rows).toEqual([])
  expect((await context.app.inject({ url: '/api/v1/backup/full' })).statusCode).toBe(401)
})

it('пустая копия не содержит искусственно созданных настроек', async () => {
  const backup = readFullBackup((await download()).json<unknown>(), '2026-10-15')
  expect(backup.text.profile).toBeNull()
  for (const rows of [backup.metadata, backup.photos, backup.documents, backup.labResults, backup.files]) expect(rows).toEqual([])
})

it('отказывается экспортировать повреждённые файлы и неверные размеры, освобождает слот', async () => {
  await upload('photos', photo, jpeg)
  await context.database.pool.query('UPDATE health.photos SET width=4 WHERE user_id=$1', [context.alice.id])
  expect((await download()).statusCode).toBe(500)
  await context.database.pool.query('UPDATE health.photos SET width=2 WHERE user_id=$1', [context.alice.id])
  expect((await download()).statusCode).toBe(200)
  await upload('documents', document, pdf)
  const corrupted = Buffer.alloc(pdf.length, 1)
  await context.database.pool.query('UPDATE health.files SET bytes=$1 WHERE user_id=$2 AND id=$3', [corrupted, context.alice.id, document.fileId])
  const response = await download()
  expect(response.statusCode).toBe(500)
  expect(response.headers['content-disposition']).toBeUndefined()
  expect(response.body).not.toContain(document.title)
})

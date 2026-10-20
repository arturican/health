// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { textBackupFixture } from '../../tests/textBackupFixture'
import { fullBackupFixture } from '../../tests/fullBackupFixture'
import { registerProducts } from './productRoutes'
import { registerPhotos } from './photoRoutes'
import { registerBackups } from './backupRoutes'
import { createUploadTransport } from './uploadTransport'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    registerProducts(app, pool, authorize)
    registerPhotos(app, pool, authorize, createUploadTransport(app, authorize), clock)
    registerBackups(app, pool, authorize, clock)
  })
  headers = await context.headers()
})
afterEach(async () => { await context.close() })
async function state() {
  return (await context.database.pool.query<{ generation: string; revision: string }>(
    'SELECT generation,change_revision::text AS revision FROM health.settings WHERE user_id=$1', [context.alice.id])).rows
}
const product = { id: '10000000-0000-4000-8000-000000000001', name: 'Учебный продукт', source: '', kcal: 100, protein: null, fat: 0, carbs: null, archived: false }

it('возвращает 400 для NUL в продукте, сохраняя ревизию и допустимый Unicode/переводы строк', async () => {
  const before = await state()
  for (const field of ['name', 'source']) {
    const response = await context.app.inject({ method: 'POST', url: '/api/v1/products', headers,
      payload: { value: { ...product, [field]: 'Учебный\u0000текст' }, revision: null } })
    expect(response.statusCode).toBe(400)
    expect(response.json<unknown>()).toMatchObject({ error: { code: 'invalid_data' } })
    expect(await state()).toEqual(before)
  }
  expect((await context.database.pool.query('SELECT id FROM health.products')).rowCount).toBe(0)
  const value = { ...product, name: 'Учебный 🧪 продукт', source: 'Состав\nВторая строка' }
  const saved = await context.app.inject({ method: 'POST', url: '/api/v1/products', headers, payload: { value, revision: null } })
  expect(saved.statusCode).toBe(201)
  expect(saved.json<unknown>()).toEqual({ value, revision: 1 })
})

it('проверяет NUL в метаданных до создания фото и файла', async () => {
  const before = await state()
  const backup = await fullBackupFixture()
  const photo = backup.photos[0], file = backup.files[0]
  if (!photo || !file) throw new Error('Нет синтетического фото')
  const metadata = { id: photo.id, fileId: photo.fileId, date: photo.date, title: 'Учебное\u0000фото', note: '', mime: 'image/jpeg' }
  const response = await context.app.inject({ method: 'POST', url: '/api/v1/photos',
    headers: { ...headers, 'content-type': 'application/octet-stream', 'x-record': Buffer.from(JSON.stringify(metadata)).toString('base64url') },
    payload: Buffer.from(file.base64, 'base64') })
  expect(response.statusCode).toBe(400)
  expect(await state()).toEqual(before)
  expect((await context.database.pool.query('SELECT id FROM health.photos UNION ALL SELECT id FROM health.files')).rowCount).toBe(0)
})

it.each(['text', 'full'] as const)('не начинает частичное восстановление %s-копии с NUL', async format => {
  const before = await state()
  const first = before[0]
  if (!first) throw new Error('Нет состояния дневника')
  const text = textBackupFixture()
  if (!text.profile) throw new Error('Нет синтетического профиля')
  text.profile.name = 'Учебный\u0000профиль'
  const value = format === 'text' ? text : { ...await fullBackupFixture(), text }
  const response = await context.app.inject({ method: 'POST', url: '/api/v1/backup/' + format,
    headers: { ...headers, 'x-diary-revision': first.revision, 'idempotency-key': randomUUID(), 'content-type': 'application/vnd.health-diary+json' },
    payload: Buffer.from(JSON.stringify(value)) })
  expect(response.statusCode).toBe(400)
  expect(await state()).toEqual(before)
  expect((await context.database.pool.query('SELECT name FROM health.profiles UNION ALL SELECT name FROM health.products')).rowCount).toBe(0)
})

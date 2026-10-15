// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { testApi } from '../../tests/serverApi'
import { registerDocuments } from './documentRoutes'
import { registerLabs } from './labRoutes'
import { createUploadTransport } from './uploadTransport'

let context: Awaited<ReturnType<typeof testApi>>
let headers: Awaited<ReturnType<typeof context.headers>>
const document = { id: randomUUID(), fileId: randomUUID(), date: '2026-10-15', title: 'Учебный бланк', kind: 'lab', note: '' }
const value = { id: '10000000-0000-4000-8000-000000000001', documentId: document.id, date: '2026-10-14', name: 'Учебный показатель', value: { type: 'number', number: 4.7, operator: 'eq' }, unit: 'ммоль/л', reference: 'Учебный интервал', note: '' }
beforeEach(async () => {
  context = await testApi((app, pool, authorize, clock) => {
    registerDocuments(app, pool, authorize, createUploadTransport(app, authorize), clock)
    registerLabs(app, pool, authorize, clock)
  })
  headers = await context.headers()
  const response = await context.app.inject({ method: 'POST', url: '/api/v1/documents',
    headers: { ...headers, 'content-type': 'application/octet-stream', 'x-record': Buffer.from(JSON.stringify({ ...document, mime: 'application/pdf' })).toString('base64url') },
    payload: Buffer.from('%PDF-1.7\n% Synthetic report only\n%%EOF\n') })
  expect(response.statusCode).toBe(201)
})
afterEach(async () => { await context.close() })
const create = (input: Record<string, unknown> = value, ownHeaders = headers) => context.app.inject({ method: 'POST', url: '/api/v1/lab-results', headers: ownHeaders, payload: { value: input, revision: null } })
const edit = (input: Record<string, unknown> = value, revision = 1, ownHeaders = headers) => context.app.inject({ method: 'PUT', url: `/api/v1/lab-results/${value.id}`, headers: ownHeaders, payload: { value: input, revision } })
const remove = (revision = 1, ownHeaders = headers) => context.app.inject({ method: 'DELETE', url: `/api/v1/lab-results/${value.id}`, headers: ownHeaders, payload: { revision } })
const list = (query = '', ownHeaders = headers) => context.app.inject({ url: `/api/v1/lab-results${query}`, headers: ownHeaders })

it('читает пустую историю, сохраняет число и источник, меняет его на текст и удаляет', async () => {
  expect((await list()).json<unknown>()).toEqual({ items: [], nextAfter: null })
  const created = await create()
  expect(created.statusCode).toBe(201)
  expect(created.json<unknown>()).toEqual({ value, revision: 1, document })
  expect((await create()).statusCode).toBe(409)
  const text = { ...value, value: { type: 'text', text: 'Не обнаружено' }, unit: '' }
  expect((await edit(text)).json<unknown>()).toEqual({ value: text, revision: 2, document })
  expect((await list(`?documentId=${document.id}`)).json<unknown>()).toEqual({ items: [{ value: text, revision: 2, document }], nextAfter: null })
  expect((await remove()).statusCode).toBe(409)
  expect((await remove(2)).statusCode).toBe(204)
  expect((await list()).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await context.app.inject({ url: `/api/v1/documents/${document.id}/results-count`, headers })).json<unknown>()).toEqual({ count: 0, revision: 4 })
})

it('сохраняет отрицательные и крайние числа, операторы и неизвестные единицы без интерпретации', async () => {
  for (const [index, number] of [-Number.MAX_VALUE, Number.MIN_VALUE, 0, Number.MAX_VALUE].entries()) {
    const input = { ...value, id: randomUUID(), value: { type: 'number', number, operator: index % 2 ? 'lt' : 'gte' }, unit: '' }
    const response = await create(input)
    expect(response.statusCode).toBe(201)
    expect(response.json<unknown>()).toEqual({ value: input, revision: 1, document })
  }
})

it('листает историю и запрещает чтение и изменения другого владельца', async () => {
  await create()
  const second = { ...value, id: '20000000-0000-4000-8000-000000000001' }
  await create(second)
  expect((await list('?limit=1')).json<unknown>()).toEqual({ items: [{ value, revision: 1, document }], nextAfter: value.id })
  expect((await list(`?limit=1&after=${value.id}`)).json<unknown>()).toEqual({ items: [{ value: second, revision: 1, document }], nextAfter: null })
  const bob = await context.headers('bob')
  expect((await list('', bob)).json<unknown>()).toEqual({ items: [], nextAfter: null })
  expect((await list(`?documentId=${document.id}`, bob)).statusCode).toBe(404)
  expect((await create(value, bob)).statusCode).toBe(404)
  expect((await edit(value, 1, bob)).statusCode).toBe(404)
  expect((await remove(1, bob)).statusCode).toBe(404)
  expect((await context.app.inject({ url: '/api/v1/lab-results' })).statusCode).toBe(401)
})

it('отклоняет неверный ввод, смену источника и конкурентную правку', async () => {
  for (const patch of [{ name: ' ' }, { date: '2026-10-16' }, { date: '2026-02-30' }, { value: { type: 'number', number: null, operator: 'eq' } }, { value: { type: 'text', text: '' } }, { user_id: context.bob.id }]) {
    expect((await create({ ...value, ...patch })).statusCode).toBe(400)
  }
  expect((await list('?limit=101')).statusCode).toBe(400)
  expect((await create({ ...value, documentId: randomUUID() })).statusCode).toBe(404)
  await create()
  expect((await edit({ ...value, documentId: randomUUID() })).statusCode).toBe(400)
  const results = await Promise.all([edit({ ...value, note: 'Первая правка' }), edit({ ...value, note: 'Вторая правка' })])
  expect(results.map(result => result.statusCode).sort()).toEqual([200, 409])
  expect((await context.app.inject({ method: 'DELETE', url: `/api/v1/documents/${document.id}`, headers, payload: { revision: 2, expectedResults: 1 } })).statusCode).toBe(409)
})

it('откатывает показатель при невозможности обновить версию документа', async () => {
  await context.database.pool.query('UPDATE health.documents SET revision=9007199254740991 WHERE user_id=$1', [context.alice.id])
  expect((await create()).statusCode).toBe(409)
  expect((await list()).json<unknown>()).toEqual({ items: [], nextAfter: null })
})

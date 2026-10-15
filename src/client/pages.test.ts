import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'
import { readPages } from './pages'
import { consistentRead } from './readState'
import { getClientSession, setClientSession } from './session'

const network = vi.fn<typeof fetch>()
beforeEach(() => { setClientSession(clientSession, clientDiary); network.mockReset(); vi.stubGlobal('fetch', network) })
afterEach(() => { setClientSession(null); vi.unstubAllGlobals() })
const state = (revision = 0) => jsonResponse({ ...clientDiary, changeRevision: revision })
const hundred = Array.from({ length: 100 }, (_, index) => index)

it.each(['after', 'before'] as const)('читает все страницы с курсором %s, сохраняя фильтры', async direction => {
  const cursor = direction === 'after' ? 'next-id' : 101
  const key = direction === 'after' ? 'nextAfter' : 'nextBefore'
  network.mockResolvedValueOnce(state()).mockResolvedValueOnce(jsonResponse({ items: hundred, [key]: cursor }))
    .mockResolvedValueOnce(jsonResponse({ items: [100], [key]: null })).mockResolvedValueOnce(state())
  await expect(readPages('/api/v1/records?date=2026-10-14', z.number(), direction)).resolves.toEqual([...hundred, 100])
  expect(network.mock.calls[2]?.[0]).toBe(`/api/v1/records?date=2026-10-14&limit=100&${direction}=${String(cursor)}`)
})

it('возвращает пустой список и отклоняет непроверенные элементы', async () => {
  network.mockResolvedValueOnce(state()).mockResolvedValueOnce(jsonResponse({ items: [], nextAfter: null })).mockResolvedValueOnce(state())
  await expect(readPages('/api/v1/records', z.number())).resolves.toEqual([])
  network.mockResolvedValueOnce(state()).mockResolvedValueOnce(jsonResponse({ items: ['wrong'], nextAfter: null }))
  await expect(readPages('/api/v1/records', z.number())).rejects.toThrow()
})

it.each([
  { items: hundred, nextBefore: 'wrong-direction' },
  { items: [1], nextAfter: 'incomplete' },
  { items: hundred, nextAfter: '' },
])('отклоняет неверный курсор или промежуточную страницу', async page => {
  network.mockResolvedValueOnce(state()).mockResolvedValueOnce(jsonResponse(page))
  await expect(readPages('/api/v1/records', z.number())).rejects.toThrow()
})

it('останавливает цикл повторяющегося курсора', async () => {
  network.mockResolvedValueOnce(state()).mockImplementation(() => Promise.resolve(jsonResponse({ items: hundred, nextAfter: 'again' })))
  await expect(readPages('/api/v1/records', z.number())).rejects.toThrow('Повторяющийся курсор')
  expect(network).toHaveBeenCalledTimes(3)
})

it('повторяет чтение при изменении данных между запросами', async () => {
  network.mockResolvedValueOnce(state(0)).mockResolvedValueOnce(state(1)).mockResolvedValueOnce(state(1)).mockResolvedValueOnce(state(1))
  const work = vi.fn<() => Promise<string>>().mockResolvedValueOnce('смешанный').mockResolvedValueOnce('согласованный')
  await expect(consistentRead(work)).resolves.toBe('согласованный')
  expect(work).toHaveBeenCalledTimes(2)
  expect(getClientSession().diary?.changeRevision).toBe(1)
})

it('ограничивает повторы при непрерывных изменениях', async () => {
  let counter = 0
  network.mockImplementation(() => Promise.resolve(state(counter++)))
  const work = vi.fn(() => Promise.resolve('изменяется'))
  await expect(consistentRead(work)).rejects.toMatchObject({ status: 409 })
  expect(work).toHaveBeenCalledTimes(3)
})

it('сбрасывает контекст и не возвращает старые данные после восстановления', async () => {
  network.mockResolvedValueOnce(state()).mockResolvedValueOnce(jsonResponse({ ...clientDiary, generation: '30000000-0000-4000-8000-000000000001' }))
  const epoch = getClientSession().epoch
  await expect(consistentRead(() => Promise.resolve('старые данные'))).rejects.toMatchObject({ status: 409 })
  expect(getClientSession().epoch).toBe(epoch + 1)
})

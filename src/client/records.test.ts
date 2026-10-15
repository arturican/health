import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { clientDiary, clientSession } from '../../tests/clientSession'
import { recordRevision, recordSchema } from './records'
import { getClientSession, setClientSession, updateDiaryState } from './session'

const schema = recordSchema(z.strictObject({ id: z.string(), title: z.string() }))
beforeEach(() => { setClientSession(clientSession, clientDiary) })
afterEach(() => { setClientSession(null) })

it('сохраняет версию исходного редактора после нового чтения того же ID', () => {
  const original = schema.parse({ value: { id: 'one', title: 'До' }, revision: 1 })
  const latest = schema.parse({ value: { id: 'one', title: 'После' }, revision: 2 })
  expect(recordRevision(original)).toBe(1)
  expect(recordRevision(latest)).toBe(2)
  expect(() => recordRevision({ ...original })).toThrow()
  const epoch = getClientSession().epoch
  updateDiaryState({ ...clientDiary, revision: 2, changeRevision: 3 })
  expect(getClientSession().epoch).toBe(epoch)
  expect(recordRevision(original)).toBe(1)
  updateDiaryState(clientDiary)
  expect(getClientSession().diary?.changeRevision).toBe(3)
})

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined])('отклоняет неверную версию %s', revision => {
  expect(() => schema.parse({ value: { id: 'one', title: 'До' }, revision })).toThrow()
})

it.each(['session', 'generation'])('не принимает запись из прежнего контекста %s', change => {
  const original = schema.parse({ value: { id: 'one', title: 'До' }, revision: 1 })
  const epoch = getClientSession().epoch
  if (change === 'session') setClientSession(clientSession, clientDiary)
  else updateDiaryState({ ...clientDiary, generation: '30000000-0000-4000-8000-000000000001' })
  expect(getClientSession().epoch).toBe(epoch + 1)
  expect(() => recordRevision(original)).toThrow()
})

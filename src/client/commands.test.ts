import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { clientDiary, clientSession } from '../../tests/clientSession'
import { executeCommand } from './commands'
import { ApiError } from './http'
import { captureContext } from './records'
import { setClientSession, updateDiaryState } from './session'

beforeEach(() => { setClientSession(clientSession, clientDiary) })
afterEach(() => { setClientSession(null) })
type Command = Parameters<Parameters<typeof executeCommand>[3]>[0]
const schema = z.strictObject({ saved: z.boolean() })

it.each([new Error('network'), new ApiError(500), new Error('body interrupted')])('повторяет исходную команду после неопределённого результата', async failure => {
  const sent: Command[] = []
  const execute = vi.fn((command: Command) => { sent.push(command); return sent.length === 1 ? Promise.reject(failure) : Promise.resolve({ saved: true }) })
  const replacement = vi.fn(() => Promise.resolve({ saved: false }))
  await expect(executeCommand('create', { title: 'Пример' }, schema, execute)).rejects.toThrow()
  await expect(executeCommand('create', { title: 'Пример' }, schema, replacement)).resolves.toEqual({ saved: true })
  expect(replacement).not.toHaveBeenCalled()
  expect(sent[0]).toBe(sent[1])
  expect(sent[0]?.id).not.toBe(sent[0]?.key)
  expect(sent[0]?.headers).toEqual({ 'Idempotency-Key': sent[0]?.key, 'X-Diary-Generation': clientDiary.generation })
  await executeCommand('create', { title: 'Пример' }, schema, execute)
  expect(sent[2]?.key).not.toBe(sent[0]?.key)
})

it('объединяет одновременные вызовы и не сохраняет их в браузере', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem'), open = vi.spyOn(indexedDB, 'open')
  const execute = vi.fn(() => Promise.resolve({ saved: true }))
  await Promise.all([executeCommand('save', { revision: 1 }, schema, execute), executeCommand('save', { revision: 1 }, schema, execute)])
  expect(execute).toHaveBeenCalledOnce()
  expect(storage).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
})

it.each([400, 403, 404, 409, 413, 429])('завершает команду при определённом отказе %s', async status => {
  const execute = vi.fn<(command: Command) => Promise<unknown>>().mockRejectedValueOnce(new ApiError(status)).mockResolvedValueOnce({ saved: true })
  await expect(executeCommand('save', {}, schema, execute)).rejects.toMatchObject({ status })
  await executeCommand('save', {}, schema, execute)
  expect(execute.mock.calls[0]?.[0].key).not.toBe(execute.mock.calls[1]?.[0].key)
})

it('не теряет ключ при повреждённом ответе и разделяет разные данные', async () => {
  const execute = vi.fn<(command: Command) => Promise<unknown>>().mockResolvedValueOnce({ saved: 'wrong' }).mockResolvedValue({ saved: true })
  await expect(executeCommand('save', { revision: 1 }, schema, execute)).rejects.toThrow()
  await executeCommand('save', { revision: 2 }, schema, execute)
  await executeCommand('save', { revision: 1 }, schema, execute)
  expect(execute.mock.calls[0]?.[0].key).toBe(execute.mock.calls[2]?.[0].key)
  expect(execute.mock.calls[1]?.[0].key).not.toBe(execute.mock.calls[0]?.[0].key)
})

it('сбрасывает неопределённые команды при смене generation и отвергает старую подготовку', async () => {
  const context = captureContext()
  const execute = vi.fn<(command: Command) => Promise<unknown>>().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ saved: true })
  await expect(executeCommand('save', {}, schema, execute)).rejects.toThrow()
  updateDiaryState({ ...clientDiary, generation: '30000000-0000-4000-8000-000000000001' })
  await expect(executeCommand('save', {}, schema, execute, context)).rejects.toMatchObject({ status: 409 })
  await executeCommand('save', {}, schema, execute)
  expect(execute.mock.calls[0]?.[0].key).not.toBe(execute.mock.calls[1]?.[0].key)
})

it('отклоняет запоздалый успех после выхода', async () => {
  await expect(executeCommand('save', {}, schema, () => {
    setClientSession(null)
    return Promise.resolve({ saved: true })
  })).rejects.toMatchObject({ status: 401 })
})

it('ограничивает память без вытеснения ключа старой команды', async () => {
  const execute = vi.fn<(command: Command) => Promise<unknown>>().mockRejectedValue(new Error('network'))
  for (let index = 0; index < 128; index++) await expect(executeCommand('save', { index }, schema, execute)).rejects.toThrow('network')
  await expect(executeCommand('save', { index: 128 }, schema, execute)).rejects.toThrow('Слишком много')
  execute.mockResolvedValue({ saved: true })
  await executeCommand('save', { index: 0 }, schema, execute)
  expect(execute.mock.calls[0]?.[0].key).toBe(execute.mock.calls[128]?.[0].key)
})

import { z } from 'zod'
import { ApiError } from './http'
import { assertContext, captureContext } from './records'
import { getClientSession, subscribeSession } from './session'
import { invalidateQueries } from './queries'

type Context = ReturnType<typeof captureContext>
type Command = Readonly<{ id: string, key: string, headers: Readonly<Record<string, string>> }>
type Entry = { command: Command, execute: (command: Command) => Promise<unknown>, pending: Promise<unknown> | null }
const entries = new Map<string, Entry>()
let epoch = getClientSession().epoch
subscribeSession(() => {
  if (getClientSession().epoch !== epoch) { epoch = getClientSession().epoch; entries.clear() }
})

/** input содержит весь смысл команды, включая исходные revision и идентификаторы файлов. */
export async function executeCommand<T>(operation: string, input: unknown, schema: z.ZodType<T>,
  execute: (command: Command) => Promise<unknown>, context: Context = captureContext()): Promise<T> {
  assertContext(context)
  const fingerprint = JSON.stringify([operation, z.json().parse(input)])
  let entry = entries.get(fingerprint)
  if (!entry) {
    if (entries.size >= 128) throw new Error('Слишком много неподтверждённых действий. Повторите прежнее действие после восстановления связи.')
    const key = crypto.randomUUID()
    entry = { command: Object.freeze({ id: crypto.randomUUID(), key,
      headers: Object.freeze({ 'Idempotency-Key': key, 'X-Diary-Generation': context.generation }) }), execute, pending: null }
    entries.set(fingerprint, entry)
  }
  const current = entry
  const pending = current.pending ?? Promise.resolve().then(() => {
    assertContext(context)
    return current.execute(current.command)
  })
  current.pending = pending
  const forget = () => { if (entries.get(fingerprint) === current) entries.delete(fingerprint) }
  try {
    const value = await pending
    assertContext(context)
    const result = schema.parse(value)
    forget()
    invalidateQueries()
    return result
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) forget()
    invalidateQueries()
    throw error
  } finally { if (current.pending === pending) current.pending = null }
}

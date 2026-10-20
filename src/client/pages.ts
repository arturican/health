import { z } from 'zod'
import { BACKUP_MAX_RECORDS } from '../domain/backup'
import { requestJSON } from './http'
import { consistentRead, type ReadScope } from './readState'
import { assertContext, captureContext } from './records'

const cursorSchema = z.union([z.string().min(1).max(80), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).nullable()
export function readPages<T>(path: string, item: z.ZodType<T>, direction: 'after' | 'before' = 'after', scope?: ReadScope): Promise<T[]> {
  const read = async () => {
    scope?.assertCurrent()
    const context = captureContext(), items: T[] = [], seen = new Set<string>()
    const url = new URL(path, 'https://health.invalid')
    if (!path.startsWith('/api/v1/')) throw new Error('Недопустимый адрес API')
    url.searchParams.set('limit', '100')
    const schema = z.union([z.strictObject({ items: z.array(item).max(100), nextAfter: cursorSchema }),
      z.strictObject({ items: z.array(item).max(100), nextBefore: cursorSchema })])
    for (;;) {
      assertContext(context)
      scope?.assertCurrent()
      const page = await requestJSON(url.pathname + url.search, schema)
      assertContext(context)
      scope?.assertCurrent()
      if ((direction === 'after') !== ('nextAfter' in page)) throw new Error('Некорректная страница API')
      const next = 'nextAfter' in page ? page.nextAfter : page.nextBefore
      items.push(...page.items)
      if (items.length > BACKUP_MAX_RECORDS || (next !== null && (page.items.length !== 100 || items.length === BACKUP_MAX_RECORDS))) {
        throw new Error('Некорректная длина списка API')
      }
      if (next === null) return items
      const cursor = String(next)
      if (seen.has(cursor)) throw new Error('Повторяющийся курсор API')
      seen.add(cursor)
      url.searchParams.set(direction, cursor)
    }
  }
  return scope ? read() : consistentRead(read)
}

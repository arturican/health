import { z } from 'zod'
import { executeCommand } from './commands'
import { requestApi } from './http'
import { captureContext, recordRevision } from './records'

type Request = { path: string, method: 'POST' | 'PUT' | 'DELETE', value: unknown }
export function mutateJSON<T>(operation: string, input: unknown, schema: z.ZodType<T>, build: (id: string) => Request,
  context = captureContext()) {
  return executeCommand(operation, input, schema, command => {
    const request = build(command.id)
    return requestApi(request.path, async response => {
      if (response.status === 204) return null
      const value: unknown = await response.json()
      return value
    }, { method: request.method, headers: { ...command.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(request.value) })
  }, context)
}

export async function deleteRecord(path: string, original: object) {
  const value = { revision: recordRevision(original) }
  await mutateJSON(`DELETE ${path}`, value, z.null(), () => ({ path, method: 'DELETE', value }))
}

import { z } from 'zod'
import { getClientSession } from './session'
import { ApiError } from './http'

type Context = Readonly<{ epoch: number, generation: string }>
const versions = new WeakMap<object, Context & { revision: number }>()
export const recordRevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

export function captureContext(): Context {
  const state = getClientSession()
  if (!state.session || !state.diary) throw new ApiError(401)
  return Object.freeze({ epoch: state.epoch, generation: state.diary.generation })
}
export function assertContext(context: Context) {
  const current = captureContext()
  if (context.epoch !== current.epoch || context.generation !== current.generation) throw new ApiError(409)
}
export function recordSchema<T extends object>(schema: z.ZodType<T>) {
  return z.object({ value: schema, revision: recordRevisionSchema }).transform(({ value, revision }) => {
    versions.set(value, { ...captureContext(), revision })
    return value
  })
}
export function recordRevision(value: object): number {
  const version = versions.get(value)
  if (!version) throw new ApiError(409)
  assertContext(version)
  return version.revision
}

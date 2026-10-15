import { stepsSchema, type Steps } from '../domain/activity'
import { calendarDate } from '../domain/schema'
import { localDate } from '../domain/input'
import { requestJSON } from './http'
import { readPages } from './pages'
import { deleteRecord, mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(stepsSchema)
export const getSteps = (date: unknown = localDate()) => requestJSON(`/api/v1/steps/${calendarDate.parse(date)}`, schema.nullable())
export const listSteps = (from: string, to: string) => readPages(`/api/v1/steps?from=${calendarDate.parse(from)}&to=${calendarDate.parse(to)}`, schema, 'before')
export async function saveSteps(input: unknown, original: Steps | null) {
  const steps = stepsSchema.parse(input)
  if (original && original.date !== steps.date) throw new Error('Дата исходной записи изменилась')
  const value = { value: steps, revision: original ? recordRevision(original) : null }
  await mutateJSON('saveSteps', value, schema, () => ({ path: `/api/v1/steps/${steps.date}`, method: 'PUT', value }))
}
export const deleteSteps = (original: Steps) => deleteRecord(`/api/v1/steps/${original.date}`, original)

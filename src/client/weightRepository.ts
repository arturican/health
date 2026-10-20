import type { ReadScope } from './readState'
import { weightSchema, type Weight } from '../domain/profile'
import { localDate, parseDate } from '../domain/input'
import { readPages } from './pages'
import { deleteRecord, mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(weightSchema), measurementSchema = weightSchema.omit({ id: true })
export const listWeights = (asOf = localDate(), scope?: ReadScope) => readPages(`/api/v1/weights?asOf=${parseDate(asOf)}`, schema, 'before', scope)
export async function latestWeight(asOf = localDate()) { return (await listWeights(asOf))[0] ?? null }
export async function saveWeight(input: unknown, original: Weight | null) {
  const measurement = measurementSchema.parse(input)
  if (original) {
    if (original.date !== measurement.date) throw new Error('Дата исходной записи изменилась')
    return updateWeight(original, measurement)
  }
  await mutateJSON('createWeight', measurement, schema, id => ({ path: '/api/v1/weights', method: 'POST', value: { value: { ...measurement, id }, revision: null } }))
}
export async function updateWeight(original: Weight, input: unknown) {
  const value = { value: { ...measurementSchema.parse(input), id: original.id }, revision: recordRevision(original) }
  await mutateJSON('updateWeight', value, schema, () => ({ path: `/api/v1/weights/${original.id}`, method: 'PUT', value }))
}
export const deleteWeight = (original: Weight) => deleteRecord(`/api/v1/weights/${original.id}`, original)

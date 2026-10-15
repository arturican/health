import { labResultSchema, readLabInput, type LabResult } from '../domain/labResult'
import { entityId } from '../domain/schema'
import { readPages } from './pages'
import { deleteRecord, mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(labResultSchema)
export async function listLabResults(documentIdInput?: unknown) {
  const query = documentIdInput === undefined ? '' : `?documentId=${entityId.parse(documentIdInput)}`
  return (await readPages(`/api/v1/lab-results${query}`, schema)).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export function addLabResult(input: unknown) {
  const value = readLabInput(input)
  return mutateJSON('createLabResult', value, schema, id => ({ path: '/api/v1/lab-results', method: 'POST', value: { value: { ...value, id }, revision: null } }))
}
export async function updateLabResult(original: LabResult, input: unknown) {
  const value = { value: { ...readLabInput(input), id: original.id }, revision: recordRevision(original) }
  await mutateJSON('updateLabResult', value, schema, () => ({ path: `/api/v1/lab-results/${original.id}`, method: 'PUT', value }))
}
export const deleteLabResult = (original: LabResult) => deleteRecord(`/api/v1/lab-results/${original.id}`, original)

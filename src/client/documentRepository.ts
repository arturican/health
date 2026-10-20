import { notifyFileDeleted } from './fileRepository'
import { z } from 'zod'
import { documentSchema, readDocumentInput, type DiaryDocument } from '../domain/document'
import { prepareDocument } from '../media/prepareDocument'
import { ApiError, requestJSON } from './http'
import { readPages } from './pages'
import { mutateJSON } from './mutations'
import { assertContext, captureContext, recordRevision, recordRevisionSchema, recordSchema } from './records'
import { uploadRecord } from './upload'

const schema = recordSchema(documentSchema)
export async function listDocuments() {
  return (await readPages('/api/v1/documents', schema)).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export async function addDocument(input: unknown, fileInput: unknown) {
  const context = captureContext(), metadata = readDocumentInput(input)
  return uploadRecord('documents', metadata, await prepareDocument(fileInput), schema, context)
}
export async function updateDocument(original: DiaryDocument, input: unknown) {
  const value = { value: readDocumentInput(input), revision: recordRevision(original) }
  await mutateJSON(`updateDocument ${original.id}`, value, schema, () => ({ path: `/api/v1/documents/${original.id}`, method: 'PUT', value }))
}
export async function countDocumentResults(original: DiaryDocument) {
  const revision = recordRevision(original)
  const result = await requestJSON(`/api/v1/documents/${original.id}/results-count`, z.strictObject({ count: z.number().int().nonnegative(), revision: recordRevisionSchema }))
  if (result.revision !== revision) throw new ApiError(409)
  return result.count
}
async function remove(original: DiaryDocument, expectedResults: number | null) {
  const context = captureContext()
  const value = { revision: recordRevision(original), expectedResults }
  await mutateJSON(`deleteDocument ${original.id}`, value, z.null(), () => ({ path: `/api/v1/documents/${original.id}`, method: 'DELETE', value }))
  assertContext(context)
  notifyFileDeleted(original.fileId)
}
export const deleteDocument = (original: DiaryDocument) => remove(original, null)
export const deleteDocumentWithResults = (original: DiaryDocument, expectedCount: unknown) => remove(original, z.number().int().min(0).max(100000).parse(expectedCount))

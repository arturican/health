import { db, type DiaryDatabase } from './db'
import { readLabInput, readLabResult, type LabResult } from '../domain/labResult'
import { readDocument } from '../domain/document'
import { entityId, validate } from '../domain/schema'

export async function listLabResults(documentIdInput: unknown, database: DiaryDatabase = db): Promise<LabResult[]> {
  const documentId = validate(entityId, documentIdInput)
  const records: unknown[] = await database.labResults.where('documentId').equals(documentId).toArray()
  return records.map(readLabResult).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export async function addLabResult(input: unknown, database: DiaryDatabase = db): Promise<LabResult> {
  const result = readLabResult({ ...readLabInput(input), id: crypto.randomUUID() })
  await database.transaction('rw', database.documents, database.labResults, async () => {
    const source: unknown = await database.documents.get(result.documentId)
    if (source === undefined) throw new Error('Документ-источник не найден')
    readDocument(source)
    await database.labResults.add(result)
  })
  return result
}

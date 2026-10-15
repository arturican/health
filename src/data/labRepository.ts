import { db, type DiaryDatabase } from './db'
import { readLabInput, readLabResult, type LabResult } from '../domain/labResult'
import { readDocument } from '../domain/document'
import { entityId, validate } from '../domain/schema'
import { assertRecordCapacity } from './recordLimit'

export async function listLabResults(documentIdInput: unknown, database: DiaryDatabase = db): Promise<LabResult[]> {
  const documentId = validate(entityId, documentIdInput)
  const records: unknown[] = await database.labResults.where('documentId').equals(documentId).toArray()
  return records.map(readLabResult).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export async function addLabResult(input: unknown, database: DiaryDatabase = db): Promise<LabResult> {
  const result = readLabResult({ ...readLabInput(input), id: crypto.randomUUID() })
  await database.transaction('rw', database.documents, database.labResults, async () => {
    assertRecordCapacity(await database.labResults.count())
    const source: unknown = await database.documents.get(result.documentId)
    if (source === undefined) throw new Error('Документ-источник не найден')
    readDocument(source)
    await database.labResults.add(result)
  })
  return result
}

export async function updateLabResult(idInput: unknown, input: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  const values = readLabInput(input)
  await database.transaction('rw', database.documents, database.labResults, async () => {
    const old: unknown = await database.labResults.get(id)
    if (old === undefined) throw new Error('Показатель не найден')
    const previous = readLabResult(old)
    if (previous.documentId !== values.documentId) throw new Error('Источник показателя менять нельзя')
    const source: unknown = await database.documents.get(previous.documentId)
    if (source === undefined) throw new Error('Документ-источник не найден')
    readDocument(source)
    await database.labResults.put(readLabResult({ ...values, id }))
  })
}
export async function deleteLabResult(idInput: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  await database.transaction('rw', database.labResults, async () => {
    const old: unknown = await database.labResults.get(id)
    if (old === undefined) throw new Error('Показатель не найден')
    await database.labResults.delete(readLabResult(old).id)
  })
}

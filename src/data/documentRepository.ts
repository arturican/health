import { z } from 'zod'
import { db, type DiaryDatabase } from './db'
import { readDocument, readDocumentInput, type DiaryDocument } from '../domain/document'
import { prepareDocument } from '../media/prepareDocument'
import { savePreparedFile } from './fileRepository'
import { entityId, validate } from '../domain/schema'
import { assertDiaryGeneration, readDiaryGeneration } from './clearDiary'

export async function listDocuments(database: DiaryDatabase = db): Promise<DiaryDocument[]> {
  const records: unknown[] = await database.documents.toArray()
  return records.map(readDocument).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export async function addDocument(input: unknown, fileInput: unknown, database: DiaryDatabase = db): Promise<DiaryDocument> {
  const values = readDocumentInput(input)
  const generation = await readDiaryGeneration(database)
  const file = await prepareDocument(fileInput)
  const document = readDocument({ ...values, id: crypto.randomUUID(), fileId: file.id })
  await database.transaction('rw', database.documents, database.files, database.metadata, async () => {
    await assertDiaryGeneration(generation, database)
    await savePreparedFile(file, database)
    await database.documents.add(document)
  })
  return document
}

export async function updateDocument(idInput: unknown, input: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  const values = readDocumentInput(input)
  await database.transaction('rw', database.documents, async () => {
    const old: unknown = await database.documents.get(id)
    if (old === undefined) throw new Error('Документ не найден')
    await database.documents.put(readDocument({ ...readDocument(old), ...values }))
  })
}
export async function deleteDocument(idInput: unknown, database: DiaryDatabase = db): Promise<void> {
  await removeDocument(idInput, null, database)
}
export async function countDocumentResults(idInput: unknown, database: DiaryDatabase = db): Promise<number> {
  const id = validate(entityId, idInput)
  return database.labResults.where('documentId').equals(id).count()
}
export async function deleteDocumentWithResults(idInput: unknown, expectedCountInput: unknown, database: DiaryDatabase = db): Promise<void> {
  const expectedCount = validate(z.number().int().min(0), expectedCountInput)
  await removeDocument(idInput, expectedCount, database)
}
async function removeDocument(idInput: unknown, expectedCount: number | null, database: DiaryDatabase): Promise<void> {
  const id = validate(entityId, idInput)
  await database.transaction('rw', database.documents, database.files, database.labResults, async () => {
    const value: unknown = await database.documents.get(id)
    if (value === undefined) throw new Error('Документ не найден')
    const document = readDocument(value)
    const count = await database.labResults.where('documentId').equals(document.id).count()
    if (expectedCount === null && count > 0) throw new Error('Нельзя удалить документ с показателями без отдельного подтверждения')
    if (expectedCount !== null && count !== expectedCount) throw new Error('Количество показателей изменилось. Проверьте подтверждение.')
    if (count > 0) await database.labResults.where('documentId').equals(document.id).delete()
    await database.documents.delete(document.id)
    await database.files.delete(document.fileId)
  })
}

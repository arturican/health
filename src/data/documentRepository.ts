import { db, type DiaryDatabase } from './db'
import { readDocument, readDocumentInput, type DiaryDocument } from '../domain/document'
import { prepareDocument } from '../media/prepareDocument'
import { savePreparedFile } from './fileRepository'
import { entityId, validate } from '../domain/schema'

export async function listDocuments(database: DiaryDatabase = db): Promise<DiaryDocument[]> {
  const records: unknown[] = await database.documents.toArray()
  return records.map(readDocument).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export async function addDocument(input: unknown, fileInput: unknown, database: DiaryDatabase = db): Promise<DiaryDocument> {
  const values = readDocumentInput(input)
  const file = await prepareDocument(fileInput)
  const document = readDocument({ ...values, id: crypto.randomUUID(), fileId: file.id })
  await database.transaction('rw', database.documents, database.files, async () => {
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
  const id = validate(entityId, idInput)
  await database.transaction('rw', database.documents, database.files, database.labResults, async () => {
    const value: unknown = await database.documents.get(id)
    if (value === undefined) throw new Error('Документ не найден')
    const document = readDocument(value)
    if (await database.labResults.where('documentId').equals(document.id).count() > 0) throw new Error('Нельзя удалить документ с показателями без отдельного подтверждения')
    await database.documents.delete(document.id)
    await database.files.delete(document.fileId)
  })
}

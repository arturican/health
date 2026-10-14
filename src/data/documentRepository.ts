import { db, type DiaryDatabase } from './db'
import { readDocument, readDocumentInput, type DiaryDocument } from '../domain/document'
import { prepareDocument } from '../media/prepareDocument'
import { savePreparedFile } from './fileRepository'

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

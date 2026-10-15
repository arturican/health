import { db, type DiaryDatabase } from './db'
import { listDocuments } from './documentRepository'
import { readLabResult } from '../domain/labResult'
import { groupLabResults } from '../domain/labPlot'

export function listLabHistory(database: DiaryDatabase = db) {
  return database.transaction('r', database.documents, database.labResults, async () => {
    const documents = await listDocuments(database)
    const input: unknown[] = await database.labResults.toArray()
    const results = input.map(readLabResult)
    const ids = new Set(documents.map(document => document.id))
    if (results.some(result => !ids.has(result.documentId))) throw new Error('Не найден документ-источник показателя')
    return { documents, series: groupLabResults(results) }
  })
}

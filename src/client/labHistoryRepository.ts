import { groupLabResults } from '../domain/labPlot'
import { consistentRead } from './readState'
import { listDocuments } from './documentRepository'
import { listLabResults } from './labRepository'

export function listLabHistory() {
  return consistentRead(async () => {
    const documents = await listDocuments(), results = await listLabResults()
    const ids = new Set(documents.map(document => document.id))
    if (results.some(result => !ids.has(result.documentId))) throw new Error('Не найден документ-источник показателя')
    return { documents, series: groupLabResults(results) }
  })
}

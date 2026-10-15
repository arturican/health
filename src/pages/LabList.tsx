import { useLiveQuery } from 'dexie-react-hooks'
import { listLabResults } from '../data/labRepository'
import { formatLabValue } from '../domain/labResult'

export function LabList({ documentId }: { documentId: string }) {
  const data = useLiveQuery(async () => ({ documentId, results: await listLabResults(documentId) }), [documentId])
  const results = data?.documentId === documentId ? data.results : undefined
  return <section aria-labelledby="lab-list-title">
    <h3 id="lab-list-title">Записанные показатели</h3>
    {results === undefined ? <p role="status">Загружаем показатели…</p> : results.length === 0 ? <p>Показателей пока нет.</p> : <ul className="record-list" aria-label="Показатели выбранного документа">
      {results.map(result => <li key={result.id}><article className="card" aria-label={`${result.name}, ${result.date}`}>
        <h4>{result.name}</h4>
        <p><time dateTime={result.date}>{result.date}</time></p>
        <p>Результат: {formatLabValue(result.value)}</p>
        <p>Единицы: {result.unit || 'не указаны'}</p>
        <p>Референс на бланке: {result.reference || 'не указан'}</p>
        {result.note && <p>{result.note}</p>}
      </article></li>)}
    </ul>}
  </section>
}

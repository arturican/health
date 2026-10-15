import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDocuments } from '../data/documentRepository'
import { SelectField } from '../ui/Field'
import { LabForm } from './LabForm'
import { LabList } from './LabList'

interface LabSectionProps { blocked?: boolean; onBusyChange?: (busy: boolean) => void }
export function LabSection({ blocked = false, onBusyChange }: LabSectionProps = {}) {
  const documents = useLiveQuery(() => listDocuments())
  const [documentId, setDocumentId] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = documents?.find(document => document.id === documentId)
  useEffect(() => { onBusyChange?.(busy); return () => { onBusyChange?.(false) } }, [busy, onBusyChange])
  return <section className="card" aria-labelledby="lab-section-title">
    <h2 id="lab-section-title">Показатели документа</h2>
    <p>Введите результат вручную как на бланке. Дневник не интерпретирует референсы, не сравнивает разные единицы и не определяет диагноз.</p>
    {documents === undefined ? <p role="status">Загружаем бланки…</p> : documents.length === 0 ? <p>Сначала добавьте документ-источник.</p> : <>
      <SelectField label="Бланк для показателей" value={documentId} disabled={blocked || busy} onChange={event => { setDocumentId(event.currentTarget.value) }}>
        <option value="">Выберите бланк</option>
        {documentId && !selected && <option value={documentId} disabled>Документ больше недоступен</option>}
        {documents.map(document => <option key={document.id} value={document.id}>{document.date} — {document.title}</option>)}
      </SelectField>
      {selected ? <>
        <h3>Источник: {selected.title}</h3>
        <p>Дата документа: {selected.date}</p>
        <LabForm key={selected.id} documentId={selected.id} defaultDate={selected.date} disabled={blocked} onBusyChange={setBusy} />
        <LabList key={`list-${selected.id}`} documentId={selected.id} />
      </> : <p>{documentId ? 'Документ больше недоступен. Выберите другой.' : 'Выберите бланк для ввода показателей.'}</p>}
    </>}
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDocuments } from '../data/documentRepository'
import { SelectField } from '../ui/Field'
import { LabForm } from './LabForm'
import { LabList } from './LabList'
import { type LabResult } from '../domain/labResult'

interface LabSectionProps { blocked?: boolean; onBusyChange?: (busy: boolean) => void }
export function LabSection({ blocked = false, onBusyChange }: LabSectionProps = {}) {
  const documents = useLiveQuery(() => listDocuments())
  const [documentId, setDocumentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [editing, setEditing] = useState<LabResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const selected = documents?.find(document => document.id === documentId)
  const activeEditing = selected && editing?.documentId === selected.id ? editing : null
  const section = useRef<HTMLElement>(null)
  const focusAfterEdit = useRef(false)
  useEffect(() => { onBusyChange?.(busy || listBusy || activeEditing !== null); return () => { onBusyChange?.(false) } }, [busy, listBusy, activeEditing, onBusyChange])
  useEffect(() => {
    if (focusAfterEdit.current && !activeEditing) { focusAfterEdit.current = false; section.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus() }
  }, [activeEditing])
  return <section ref={section} className="card lab-entry" aria-labelledby="lab-section-title">
    <h2 id="lab-section-title">Показатели документа</h2>
    <p>Введите результат вручную как на бланке. Дневник не интерпретирует референсы, не сравнивает разные единицы и не определяет диагноз.</p>
    {documents === undefined ? <p role="status">Загружаем бланки…</p> : documents.length === 0 ? <p>Сначала добавьте документ-источник.</p> : <>
      <SelectField label="Бланк для показателей" value={documentId} disabled={blocked || busy || listBusy || activeEditing !== null} onChange={event => { setDocumentId(event.currentTarget.value); setEditing(null); setNotice(null) }}>
        <option value="">Выберите бланк</option>
        {documentId && !selected && <option value={documentId} disabled>Документ больше недоступен</option>}
        {documents.map(document => <option key={document.id} value={document.id}>{document.date} — {document.title}</option>)}
      </SelectField>
      {selected ? <>
        <h3>Источник: {selected.title}</h3>
        <p>Дата документа: {selected.date}</p>
        <div className="lab-entry-layout">
        <div className="lab-editor">
        <LabForm key={activeEditing?.id ?? selected.id} documentId={selected.id} defaultDate={selected.date} disabled={blocked || listBusy} onBusyChange={setBusy} entry={activeEditing} onSaved={() => {
          if (activeEditing) { focusAfterEdit.current = true; setEditing(null); setNotice('Показатель обновлён') }
          else setNotice(null)
        }} onCancel={() => { focusAfterEdit.current = true; setEditing(null); setNotice(null) }} />
        {notice && <p role="status">{notice}</p>}
        </div>
        <div className="lab-records">
        <LabList key={`list-${selected.id}`} documentId={selected.id} blocked={blocked || busy || activeEditing !== null} onBusyChange={setListBusy} onEdit={result => { setNotice(null); setEditing(result) }} />
        </div>
        </div>
      </> : <p>{documentId ? 'Документ больше недоступен. Выберите другой.' : 'Выберите бланк для ввода показателей.'}</p>}
    </>}
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { useDiaryQuery, deleteLabResult, listLabResults } from '../dataAccess'
import { formatLabValue, type LabResult } from '../domain/labResult'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'

interface LabListProps { documentId: string; blocked: boolean; onEdit: (result: LabResult) => void; onBusyChange: (busy: boolean) => void }
export function LabList({ documentId, blocked, onEdit, onBusyChange }: LabListProps) {
  const data = useDiaryQuery(async () => ({ documentId, results: await listLabResults(documentId) }), [documentId])
  const results = data?.documentId === documentId ? data.results : undefined
  const [deleting, setDeleting] = useState<LabResult | null>(null)
  const action = useAction()
  const section = useRef<HTMLElement>(null)
  const focusAfterAttempt = useRef<'heading' | 'cancel' | null>(null)
  useEffect(() => { onBusyChange(action.pending || deleting !== null); return () => { onBusyChange(false) } }, [action.pending, deleting, onBusyChange])
  useEffect(() => {
    if (!action.pending && focusAfterAttempt.current) {
      section.current?.querySelector<HTMLElement>(focusAfterAttempt.current === 'heading' ? 'h3' : '[role="alertdialog"] button')?.focus()
      focusAfterAttempt.current = null
    }
  }, [action.pending, deleting])
  return <section ref={section} aria-labelledby="lab-list-title">
    <h3 id="lab-list-title" tabIndex={-1}>Записанные показатели</h3>
    <Feedback error={action.error} message={action.message} />
    {results === undefined ? <p role="status">Загружаем показатели…</p> : results.length === 0 ? <p>Показателей пока нет.</p> : <ul className="record-list" aria-label="Показатели выбранного документа">
      {results.map((result, index) => <li key={result.id}><article className="card" aria-label={`${result.name}, ${result.date}`}>
        <h4>{result.name}</h4>
        <p><time dateTime={result.date}>{result.date}</time></p>
        <p>Результат: {formatLabValue(result.value)}</p>
        <p>Единицы: {result.unit || 'не указаны'}</p>
        <p>Референс на бланке: {result.reference || 'не указан'}</p>
        {result.note && <p>{result.note}</p>}
        <div className="actions">
          <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Изменить показатель ${String(index + 1)}: ${result.name}`} onClick={() => { action.reset(); onEdit(result) }}>Изменить</button>
          <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Удалить показатель ${String(index + 1)}: ${result.name}`} onClick={() => { action.reset(); setDeleting(result) }}>Удалить</button>
        </div>
      </article></li>)}
    </ul>}
    {deleting && <Confirmation question={`Удалить показатель «${deleting.name}» за ${deleting.date}?`} pending={action.pending} onCancel={() => { setDeleting(null) }} onConfirm={() => {
      action.run(async () => {
        try { await deleteLabResult(deleting) }
        catch (reason: unknown) { focusAfterAttempt.current = 'cancel'; throw reason }
        focusAfterAttempt.current = 'heading'
        setDeleting(null)
      }, 'Показатель удалён')
    }} />}
  </section>
}

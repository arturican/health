import { useEffect, useRef, useState } from 'react'
import { useDiaryQuery, countDocumentResults, deleteDocument, deleteDocumentWithResults, listDocuments } from '../dataAccess'
import { documentKinds, type DiaryDocument } from '../domain/document'
import { Field } from '../ui/Field'
import { DocumentFile } from './DocumentFile'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'
import { Icon } from '../ui/Icon'

interface DocumentListProps { onEdit: (document: DiaryDocument) => void; blocked: boolean; onBusyChange: (busy: boolean) => void }
export function DocumentList({ onEdit, blocked, onBusyChange }: DocumentListProps) {
  const documents = useDiaryQuery(() => listDocuments())
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<DiaryDocument | null>(null)
  const linked = useDiaryQuery(async () => deleting ? { id: deleting.id, count: await countDocumentResults(deleting) } : null, [deleting?.id])
  const count = linked?.id === deleting?.id ? linked?.count : undefined
  const action = useAction()
  const heading = useRef<HTMLHeadingElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const focusAfterAttempt = useRef<'heading' | 'opener' | 'cancel' | null>(null)
  useEffect(() => { onBusyChange(action.pending || deleting !== null) }, [action.pending, deleting, onBusyChange])
  useEffect(() => {
    if (!action.pending && focusAfterAttempt.current) {
      if (focusAfterAttempt.current === 'cancel') heading.current?.parentElement?.querySelector<HTMLElement>('[role="alertdialog"] button')?.focus()
      else if (focusAfterAttempt.current === 'opener' && opener.current?.isConnected) opener.current.focus()
      else heading.current?.focus()
      focusAfterAttempt.current = null
    }
  }, [action.pending, deleting])
  const term = query.trim().toLocaleLowerCase('ru-RU')
  const found = documents?.filter(document => `${document.date} ${document.title} ${document.note} ${documentKinds[document.kind]}`.toLocaleLowerCase('ru-RU').includes(term))
  return <section className="card document-library" aria-labelledby="document-list-title">
    <h2 id="document-list-title" tabIndex={-1} ref={heading}>Документы по датам</h2>
    <Feedback error={action.error} message={action.message} />
    <Field label="Найти документ" type="search" value={query} disabled={action.pending || deleting !== null} onChange={event => { setQuery(event.currentTarget.value) }} placeholder="Название, дата, заметка, категория" />
    {documents === undefined ? <p role="status">Загружаем документы…</p> : documents.length === 0 ? <p>Документов пока нет.</p> : found?.length === 0 ? <p role="status">По запросу ничего не найдено.</p> : <ul className="record-list" aria-label="Сохранённые документы">
      {found?.map((document, index) => <li key={document.id}>
        <article className="card" aria-label={`${document.title}, ${document.date}`}>
          <h3><Icon name="documents" />{document.title}</h3>
          <p><time dateTime={document.date}>{document.date}</time> · {documentKinds[document.kind]}</p>
          {document.note && <p>{document.note}</p>}
          <DocumentFile key={document.fileId} fileId={document.fileId} title={document.title} />
          <div className="actions">
            <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Изменить документ ${String(index + 1)}: ${document.title}`} onClick={() => { action.reset(); onEdit(document) }}>Изменить</button>
            <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Удалить документ ${String(index + 1)}: ${document.title}`} onClick={event => { opener.current = event.currentTarget; action.reset(); setDeleting(document) }}>Удалить</button>
          </div>
        </article>
      </li>)}
    </ul>}
    {deleting && count === undefined && <p role="status">Проверяем связанные показатели…</p>}
    {deleting && count !== undefined && <Confirmation question={count > 0 ? `Удалить документ «${deleting.title}» за ${deleting.date}, его файл и показатели (${String(count)})?` : `Удалить документ «${deleting.title}» за ${deleting.date} и его файл?`} pending={action.pending} onCancel={() => { focusAfterAttempt.current = 'opener'; setDeleting(null) }} onConfirm={() => {
      action.run(async () => {
        try {
          if (count > 0) await deleteDocumentWithResults(deleting, count)
          else await deleteDocument(deleting)
        } catch (reason: unknown) { focusAfterAttempt.current = 'cancel'; throw reason }
        focusAfterAttempt.current = 'heading'
        setDeleting(null)
      }, 'Документ удалён')
    }} />}
  </section>
}

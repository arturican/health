import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteDocument, listDocuments } from '../data/documentRepository'
import { documentKinds, type DiaryDocument } from '../domain/document'
import { Field } from '../ui/Field'
import { DocumentFile } from './DocumentFile'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'

interface DocumentListProps { onEdit: (document: DiaryDocument) => void; blocked: boolean; onBusyChange: (busy: boolean) => void }
export function DocumentList({ onEdit, blocked, onBusyChange }: DocumentListProps) {
  const documents = useLiveQuery(() => listDocuments())
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<DiaryDocument | null>(null)
  const action = useAction()
  const heading = useRef<HTMLHeadingElement>(null)
  const focusAfterDelete = useRef(false)
  useEffect(() => { onBusyChange(action.pending || deleting !== null) }, [action.pending, deleting, onBusyChange])
  useEffect(() => {
    if (focusAfterDelete.current && !action.pending && !deleting) { focusAfterDelete.current = false; heading.current?.focus() }
  }, [action.pending, deleting])
  const term = query.trim().toLocaleLowerCase('ru-RU')
  const found = documents?.filter(document => `${document.date} ${document.title} ${document.note} ${documentKinds[document.kind]}`.toLocaleLowerCase('ru-RU').includes(term))
  return <section aria-labelledby="document-list-title">
    <h2 id="document-list-title" tabIndex={-1} ref={heading}>Документы по датам</h2>
    <Feedback error={action.error} message={action.message} />
    <Field label="Найти документ" type="search" value={query} onChange={event => { setQuery(event.currentTarget.value) }} placeholder="Название, дата, заметка, категория" />
    {documents === undefined ? <p role="status">Загружаем документы…</p> : documents.length === 0 ? <p>Документов пока нет.</p> : found?.length === 0 ? <p role="status">По запросу ничего не найдено.</p> : <ul className="record-list" aria-label="Сохранённые документы">
      {found?.map((document, index) => <li key={document.id}>
        <article className="card" aria-label={`${document.title}, ${document.date}`}>
          <h3>{document.title}</h3>
          <p><time dateTime={document.date}>{document.date}</time> · {documentKinds[document.kind]}</p>
          {document.note && <p>{document.note}</p>}
          <DocumentFile key={document.fileId} fileId={document.fileId} title={document.title} />
          <div className="actions">
            <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Изменить документ ${String(index + 1)}: ${document.title}`} onClick={() => { action.reset(); onEdit(document) }}>Изменить</button>
            <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Удалить документ ${String(index + 1)}: ${document.title}`} onClick={() => { action.reset(); setDeleting(document) }}>Удалить</button>
          </div>
        </article>
      </li>)}
    </ul>}
    {deleting && <Confirmation question={`Удалить документ «${deleting.title}» за ${deleting.date} и его файл?`} pending={action.pending} onCancel={() => { setDeleting(null) }} onConfirm={() => {
      action.run(async () => { await deleteDocument(deleting.id); focusAfterDelete.current = true; setDeleting(null) }, 'Документ удалён')
    }} />}
  </section>
}

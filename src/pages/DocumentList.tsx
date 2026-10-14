import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listDocuments } from '../data/documentRepository'
import { documentKinds } from '../domain/document'
import { Field } from '../ui/Field'
import { DocumentFile } from './DocumentFile'

export function DocumentList() {
  const documents = useLiveQuery(() => listDocuments())
  const [query, setQuery] = useState('')
  const term = query.trim().toLocaleLowerCase('ru-RU')
  const found = documents?.filter(document => `${document.date} ${document.title} ${document.note} ${documentKinds[document.kind]}`.toLocaleLowerCase('ru-RU').includes(term))
  return <section aria-labelledby="document-list-title">
    <h2 id="document-list-title">Документы по датам</h2>
    <Field label="Найти документ" type="search" value={query} onChange={event => { setQuery(event.currentTarget.value) }} placeholder="Название, дата, заметка, категория" />
    {documents === undefined ? <p role="status">Загружаем документы…</p> : documents.length === 0 ? <p>Документов пока нет.</p> : found?.length === 0 ? <p role="status">По запросу ничего не найдено.</p> : <ul className="record-list" aria-label="Сохранённые документы">
      {found?.map(document => <li key={document.id}>
        <article className="card" aria-label={`${document.title}, ${document.date}`}>
          <h3>{document.title}</h3>
          <p><time dateTime={document.date}>{document.date}</time> · {documentKinds[document.kind]}</p>
          {document.note && <p>{document.note}</p>}
          <DocumentFile key={document.fileId} fileId={document.fileId} title={document.title} />
        </article>
      </li>)}
    </ul>}
  </section>
}

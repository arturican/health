import { useEffect, useRef, useState } from 'react'
import { type DiaryDocument } from '../domain/document'
import { DocumentForm } from './DocumentForm'
import { DocumentList } from './DocumentList'

export function DocumentsPage() {
  const [editing, setEditing] = useState<DiaryDocument | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const section = useRef<HTMLElement>(null)
  const focusAfterEdit = useRef(false)
  useEffect(() => {
    if (focusAfterEdit.current && !editing) { focusAfterEdit.current = false; section.current?.querySelector<HTMLInputElement>('[name="title"]')?.focus() }
  }, [editing])
  return <section ref={section} className="page" aria-labelledby="documents-title">
    <h1 id="documents-title">Документы</h1>
    <p>Файлы хранятся в этом браузере. Сохраняйте резервные копии: очистка браузера может удалить записи.</p>
    <DocumentForm key={editing?.id ?? 'new'} entry={editing} disabled={listBusy} onBusyChange={setFormBusy} onSaved={() => {
      if (editing) { focusAfterEdit.current = true; setEditing(null); setNotice('Документ обновлён') }
      else setNotice(null)
    }} onCancel={() => { focusAfterEdit.current = true; setEditing(null); setNotice(null) }} />
    {notice && <p role="status">{notice}</p>}
    <DocumentList blocked={formBusy || editing !== null} onBusyChange={setListBusy} onEdit={document => { setNotice(null); setEditing(document) }} />
  </section>
}

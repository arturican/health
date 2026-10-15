import { useEffect, useRef, useState } from 'react'
import { type DiaryDocument } from '../domain/document'
import { DocumentForm } from './DocumentForm'
import { DocumentList } from './DocumentList'
import { LabSection } from './LabSection'
import { LabTrends } from './LabTrends'
import { Icon } from '../ui/Icon'
import '../documents.css'

export function DocumentsPage() {
  const [editing, setEditing] = useState<DiaryDocument | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [listBusy, setListBusy] = useState(false)
  const [labBusy, setLabBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const section = useRef<HTMLElement>(null)
  const focusAfterEdit = useRef(false)
  useEffect(() => {
    if (focusAfterEdit.current && !editing) { focusAfterEdit.current = false; section.current?.querySelector<HTMLInputElement>('[name="title"]')?.focus() }
  }, [editing])
  return <section ref={section} className="page documents-page" aria-labelledby="documents-title">
    <h1 id="documents-title">Документы</h1>
    <p>Бланки анализов и история показателей в одном месте.</p>
    <ol className="documents-steps"><li>Сохраните бланк</li><li>Внесите показатели вручную</li><li>Наблюдайте изменения по датам</li></ol>
    <p>Файлы хранятся в этом браузере. Сохраняйте резервные копии: очистка браузера может удалить записи.</p>
    <LabTrends />
    <div className="documents-layout">
    <div className="card document-editor">
    <h2><Icon name="documents" /> {editing ? 'Изменить бланк' : 'Загрузить анализ'}</h2>
    <p>Сохраните оригинал, затем перенесите нужные значения в показатели документа.</p>
    <DocumentForm key={editing?.id ?? 'new'} entry={editing} disabled={listBusy || labBusy} onBusyChange={setFormBusy} onSaved={() => {
      if (editing) { focusAfterEdit.current = true; setEditing(null); setNotice('Документ обновлён') }
      else setNotice(null)
    }} onCancel={() => { focusAfterEdit.current = true; setEditing(null); setNotice(null) }} />
    {notice && <p role="status">{notice}</p>}
    </div>
    <DocumentList blocked={formBusy || labBusy || editing !== null} onBusyChange={setListBusy} onEdit={document => { setNotice(null); setEditing(document) }} />
    </div>
    <LabSection blocked={formBusy || listBusy || editing !== null} onBusyChange={setLabBusy} />
  </section>
}

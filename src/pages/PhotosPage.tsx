import { useEffect, useRef, useState } from 'react'
import { type Photo } from '../domain/photo'
import { PhotoForm } from './PhotoForm'
import { PhotoGallery } from './PhotoGallery'
import { PhotoComparison } from './PhotoComparison'
import { Icon } from '../ui/Icon'
import { StorageBoundary } from '../ui/StorageBoundary'
import '../photos.css'

export function PhotosPage() {
  const [editing, setEditing] = useState<Photo | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [galleryBusy, setGalleryBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const section = useRef<HTMLElement>(null)
  const focusAfterEdit = useRef(false)
  useEffect(() => {
    if (focusAfterEdit.current && !editing) { focusAfterEdit.current = false; section.current?.querySelector<HTMLInputElement>('[name="title"]')?.focus() }
  }, [editing])
  return <section ref={section} className="page photos-page" aria-labelledby="photos-title">
    <h1 id="photos-title">Фото</h1>
    <p>Фотографии помогают сравнивать записи по датам. Они не определяют диагноз или состав тела.</p>
    <div className="photos-layout">
    <div className="card photo-editor">
    <h2><Icon name="photos" /> {editing ? 'Изменить запись' : 'Добавить фотографию'}</h2>
    <p>Сохраните дату и подпись, чтобы вернуться к этому моменту.</p>
    <PhotoForm key={editing?.id ?? 'new'} entry={editing} disabled={galleryBusy} onBusyChange={setFormBusy} onSaved={() => {
      if (editing) { focusAfterEdit.current = true; setEditing(null); setNotice('Фото обновлено') }
      else setNotice(null)
    }} onCancel={() => { focusAfterEdit.current = true; setEditing(null); setNotice(null) }} />
    {notice && <p role="status">{notice}</p>}
    </div>
    <StorageBoundary>
      <PhotoComparison />
    </StorageBoundary>
    </div>
    <StorageBoundary>
      <PhotoGallery blocked={formBusy || editing !== null} onBusyChange={setGalleryBusy} onEdit={photo => { setNotice(null); setEditing(photo) }} />
    </StorageBoundary>
  </section>
}

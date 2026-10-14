import { useEffect, useRef, useState } from 'react'
import { type Photo } from '../domain/photo'
import { PhotoForm } from './PhotoForm'
import { PhotoGallery } from './PhotoGallery'
import { PhotoComparison } from './PhotoComparison'

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
  return <section ref={section} className="page" aria-labelledby="photos-title">
    <h1 id="photos-title">Фото</h1>
    <p>Фотографии помогают сравнивать записи по датам. Они не определяют диагноз или состав тела.</p>
    <PhotoForm key={editing?.id ?? 'new'} entry={editing} disabled={galleryBusy} onBusyChange={setFormBusy} onSaved={() => {
      if (editing) { focusAfterEdit.current = true; setEditing(null); setNotice('Фото обновлено') }
      else setNotice(null)
    }} onCancel={() => { focusAfterEdit.current = true; setEditing(null); setNotice(null) }} />
    {notice && <p role="status">{notice}</p>}
    <PhotoComparison />
    <PhotoGallery blocked={formBusy || editing !== null} onBusyChange={setGalleryBusy} onEdit={photo => { setNotice(null); setEditing(photo) }} />
  </section>
}

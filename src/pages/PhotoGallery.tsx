import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deletePhoto, listPhotos } from '../data/photoRepository'
import { type Photo } from '../domain/photo'
import { FileImage } from '../ui/FileImage'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'

interface PhotoGalleryProps { onEdit: (photo: Photo) => void; blocked: boolean; onBusyChange: (busy: boolean) => void }
export function PhotoGallery({ onEdit, blocked, onBusyChange }: PhotoGalleryProps) {
  const photos = useLiveQuery(() => listPhotos())
  const [deleting, setDeleting] = useState<Photo | null>(null)
  const action = useAction()
  const heading = useRef<HTMLHeadingElement>(null)
  const focusAfterDelete = useRef(false)
  useEffect(() => { onBusyChange(action.pending || deleting !== null) }, [action.pending, deleting, onBusyChange])
  useEffect(() => {
    if (focusAfterDelete.current && !action.pending && !deleting) {
      focusAfterDelete.current = false
      heading.current?.focus()
    }
  }, [action.pending, deleting])
  return <section aria-labelledby="photo-gallery-title">
    <h2 id="photo-gallery-title" tabIndex={-1} ref={heading}>Галерея фото</h2>
    <Feedback error={action.error} message={action.message} />
    {photos === undefined ? <p role="status">Загружаем фотографии…</p> : photos.length === 0 ? <p>Фотографий пока нет.</p> : <ul className="record-list" aria-label="Фотографии по датам">
      {photos.map((photo, index) => <li key={photo.id}>
        <article className="card" aria-label={`${photo.title}, ${photo.date}`}>
          <h3>{photo.title}</h3>
          <p><time dateTime={photo.date}>{photo.date}</time></p>
          <FileImage fileId={photo.fileId} alt={photo.title} width={photo.width} height={photo.height} />
          {photo.note && <p>{photo.note}</p>}
          <div className="actions">
            <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Изменить фото ${String(index + 1)}: ${photo.title}`} onClick={() => { action.reset(); onEdit(photo) }}>Изменить</button>
            <button type="button" disabled={blocked || action.pending || deleting !== null} aria-label={`Удалить фото ${String(index + 1)}: ${photo.title}`} onClick={() => { action.reset(); setDeleting(photo) }}>Удалить</button>
          </div>
        </article>
      </li>)}
    </ul>}
    {deleting && <Confirmation question={`Удалить фото «${deleting.title}» за ${deleting.date} и его файл?`} pending={action.pending} onCancel={() => { setDeleting(null) }} onConfirm={() => {
      action.run(async () => { await deletePhoto(deleting.id); focusAfterDelete.current = true; setDeleting(null) }, 'Фото удалено')
    }} />}
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { useDiaryQueryState } from '../dataAccess'
import { deletePhoto, listPhotos } from '../dataAccess'
import { type Photo } from '../domain/photo'
import { FileImage } from '../ui/FileImage'
import { Confirmation } from '../ui/Confirmation'
import { Feedback, useAction } from '../ui/actions'

const PAGE_SIZE = 6

interface PhotoGalleryProps { onEdit: (photo: Photo) => void; blocked: boolean; onBusyChange: (busy: boolean) => void }
export function PhotoGallery({ onEdit, blocked, onBusyChange }: PhotoGalleryProps) {
  const { data: photos, current } = useDiaryQueryState(() => listPhotos())
  const [page, setPage] = useState(0)
  const currentPage = Math.min(page, Math.max(0, Math.ceil((photos?.length ?? 0) / PAGE_SIZE) - 1))
  if (page !== currentPage) setPage(currentPage)
  const offset = currentPage * PAGE_SIZE
  const visible = photos?.slice(offset, offset + PAGE_SIZE)
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
  return <section className="card photo-gallery" aria-labelledby="photo-gallery-title">
    <h2 id="photo-gallery-title" tabIndex={-1} ref={heading}>Галерея фото</h2>
    <Feedback error={action.error} message={action.message} />
    {photos === undefined ? <p role="status">Загружаем фотографии…</p> : photos.length === 0 ? <p>Фотографий пока нет.</p> : <ul className="record-list" aria-label="Фотографии по датам">
      {visible?.map((photo, index) => <li key={photo.id}>
        <article className="card" aria-label={`${photo.title}, ${photo.date}`}>
          <h3>{photo.title}</h3>
          <p><time dateTime={photo.date}>{photo.date}</time></p>
          <FileImage fileId={photo.fileId} alt={photo.title} width={photo.width} height={photo.height} />
          {photo.note && <p>{photo.note}</p>}
          <div className="actions">
            <button type="button" disabled={!current || blocked || action.pending || deleting !== null} aria-label={`Изменить фото ${String(offset + index + 1)}: ${photo.title}`} onClick={() => { action.reset(); onEdit(photo) }}>Изменить</button>
            <button type="button" disabled={!current || blocked || action.pending || deleting !== null} aria-label={`Удалить фото ${String(offset + index + 1)}: ${photo.title}`} onClick={() => { action.reset(); setDeleting(photo) }}>Удалить</button>
          </div>
        </article>
      </li>)}
    </ul>}
    {photos && photos.length > PAGE_SIZE && <nav className="actions" aria-label="Страницы галереи">
      <button type="button" disabled={currentPage === 0 || action.pending || deleting !== null} onClick={() => {
        setPage(currentPage - 1); heading.current?.focus()
      }}>Предыдущие фото</button>
      <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, photos.length)} из {photos.length}</span>
      <button type="button" disabled={offset + PAGE_SIZE >= photos.length || action.pending || deleting !== null} onClick={() => {
        setPage(currentPage + 1); heading.current?.focus()
      }}>Следующие фото</button>
    </nav>}
    {deleting && <Confirmation question={`Удалить фото «${deleting.title}» за ${deleting.date} и его файл?`} pending={action.pending} confirmDisabled={!current} onCancel={() => { setDeleting(null) }} onConfirm={() => {
      action.run(async () => { await deletePhoto(deleting); focusAfterDelete.current = true; setDeleting(null) }, 'Фото удалено')
    }} />}
  </section>
}

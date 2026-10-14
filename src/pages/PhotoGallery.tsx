import { useLiveQuery } from 'dexie-react-hooks'
import { listPhotos } from '../data/photoRepository'
import { FileImage } from '../ui/FileImage'

export function PhotoGallery() {
  const photos = useLiveQuery(() => listPhotos())
  return <section aria-labelledby="photo-gallery-title">
    <h2 id="photo-gallery-title">Галерея фото</h2>
    {photos === undefined ? <p role="status">Загружаем фотографии…</p> : photos.length === 0 ? <p>Фотографий пока нет.</p> : <ul className="record-list" aria-label="Фотографии по датам">
      {photos.map(photo => <li key={photo.id}>
        <article className="card" aria-label={`${photo.title}, ${photo.date}`}>
          <h3>{photo.title}</h3>
          <p><time dateTime={photo.date}>{photo.date}</time></p>
          <FileImage fileId={photo.fileId} alt={photo.title} width={photo.width} height={photo.height} />
          {photo.note && <p>{photo.note}</p>}
        </article>
      </li>)}
    </ul>}
  </section>
}

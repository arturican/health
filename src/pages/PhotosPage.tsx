import { PhotoForm } from './PhotoForm'
import { PhotoGallery } from './PhotoGallery'

export function PhotosPage() {
  return <section className="page" aria-labelledby="photos-title">
    <h1 id="photos-title">Фото</h1>
    <p>Фотографии помогают сравнивать записи по датам. Они не определяют диагноз или состав тела.</p>
    <PhotoForm />
    <PhotoGallery />
  </section>
}

import { useState } from 'react'
import { useDiaryQuery } from '../dataAccess'
import { listPhotos } from '../dataAccess'
import { SelectField } from '../ui/Field'
import { FileImage } from '../ui/FileImage'
import { Icon } from '../ui/Icon'

export function PhotoComparison() {
  const photos = useDiaryQuery(() => listPhotos())
  const [firstId, setFirstId] = useState('')
  const [secondId, setSecondId] = useState('')
  const first = photos?.find(photo => photo.id === firstId)
  const second = photos?.find(photo => photo.id === secondId)
  const same = first !== undefined && first.id === second?.id
  return <section className="card photo-comparison-card" aria-labelledby="photo-comparison-title">
    <h2 id="photo-comparison-title">Сравнение фото</h2>
    <p>Сравнивайте записи по датам. Освещение, ракурс и положение камеры могут отличаться; фото не определяет диагноз или состав тела.</p>
    {photos === undefined ? <p role="status">Загружаем выбор фотографий…</p> : <>
      {photos.length < 2 && <p>Для сравнения добавьте минимум две фотографии.</p>}
      <div className="photo-comparison">
        <SelectField label="Первое фото" value={firstId} onChange={event => { setFirstId(event.currentTarget.value) }}>
          <option value="">Выберите фото</option>
          {firstId && !first && <option value={firstId} disabled>Фото больше недоступно</option>}
          {photos.map(photo => <option key={photo.id} value={photo.id}>{photo.date} — {photo.title}</option>)}
        </SelectField>
        <SelectField label="Второе фото" value={secondId} error={same ? 'Выберите два разных фото для сравнения.' : undefined} onChange={event => { setSecondId(event.currentTarget.value) }}>
          <option value="">Выберите фото</option>
          {secondId && !second && <option value={secondId} disabled>Фото больше недоступно</option>}
          {photos.map(photo => <option key={photo.id} value={photo.id}>{photo.date} — {photo.title}</option>)}
        </SelectField>
      </div>
      {same ? <p role="alert">Выберите два разных фото для сравнения.</p> : <div className="photo-comparison">
        <figure aria-label="Первое выбранное фото">
          {first ? <><figcaption>{first.date} — {first.title}</figcaption><FileImage fileId={first.fileId} alt={`Первое фото: ${first.title}`} width={first.width} height={first.height} /></> : <div className="photo-placeholder"><Icon name="photos" /><p>{firstId ? 'Первое фото больше недоступно. Выберите другое.' : 'Выберите первое фото.'}</p></div>}
        </figure>
        <figure aria-label="Второе выбранное фото">
          {second ? <><figcaption>{second.date} — {second.title}</figcaption><FileImage fileId={second.fileId} alt={`Второе фото: ${second.title}`} width={second.width} height={second.height} /></> : <div className="photo-placeholder"><Icon name="photos" /><p>{secondId ? 'Второе фото больше недоступно. Выберите другое.' : 'Выберите второе фото.'}</p></div>}
        </figure>
      </div>}
    </>}
  </section>
}

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listPhotos } from '../data/photoRepository'
import { SelectField } from '../ui/Field'
import { FileImage } from '../ui/FileImage'

export function PhotoComparison() {
  const photos = useLiveQuery(() => listPhotos())
  const [firstId, setFirstId] = useState('')
  const [secondId, setSecondId] = useState('')
  const first = photos?.find(photo => photo.id === firstId)
  const second = photos?.find(photo => photo.id === secondId)
  const same = first !== undefined && first.id === second?.id
  return <section className="card" aria-labelledby="photo-comparison-title">
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
          {first ? <><figcaption>{first.date} — {first.title}</figcaption><FileImage fileId={first.fileId} alt={`Первое фото: ${first.title}`} width={first.width} height={first.height} /></> : <p>{firstId ? 'Первое фото больше недоступно. Выберите другое.' : 'Выберите первое фото.'}</p>}
        </figure>
        <figure aria-label="Второе выбранное фото">
          {second ? <><figcaption>{second.date} — {second.title}</figcaption><FileImage fileId={second.fileId} alt={`Второе фото: ${second.title}`} width={second.width} height={second.height} /></> : <p>{secondId ? 'Второе фото больше недоступно. Выберите другое.' : 'Выберите второе фото.'}</p>}
        </figure>
      </div>}
    </>}
  </section>
}

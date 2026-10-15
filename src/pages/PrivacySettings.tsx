import { useEffect, useRef, type SyntheticEvent } from 'react'
import { saveVisibility } from '../data/visibilityRepository'
import { useVisibility } from '../ui/useVisibility'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'
import { Icon } from '../ui/Icon'

export function PrivacySettings() {
  const settings = useVisibility()
  const action = useAction()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (action.error || action.message) button.current?.focus() }, [action.error, action.message])
  function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    action.run(() => saveVisibility({ version: 1, showPhotos: form.has('showPhotos'), showDocuments: form.has('showDocuments') }), 'Видимость разделов сохранена')
  }
  return <section className="card" aria-labelledby="visibility-title">
    <h2 id="visibility-title"><Icon name="settings" /> Видимость разделов</h2>
    <p>Скрытие убирает раздел из интерфейса. Записи и файлы сохраняются и входят в полную копию. Это не защита доступа и не шифрование.</p>
    {!settings ? <p role="status">Загружаем настройки видимости…</p> : <>
      {settings.failed && <p role="alert">Не удалось прочитать настройки видимости. Фото и документы скрыты. Выберите нужные разделы и сохраните настройки, чтобы восстановить доступ.</p>}
      <form aria-label="Видимость разделов" onSubmit={save}>
        <fieldset key={String(settings.value.showPhotos) + String(settings.value.showDocuments)} disabled={action.pending}>
          <legend>Разделы дневника</legend>
          <Field label="Показывать фото" name="showPhotos" type="checkbox" defaultChecked={settings.value.showPhotos} />
          <Field label="Показывать документы и показатели" name="showDocuments" type="checkbox" defaultChecked={settings.value.showDocuments} />
        </fieldset>
        <button ref={button} type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем видимость…' : 'Сохранить видимость'}</button>
      </form>
    </>}
    <Feedback error={action.error} message={action.message} />
  </section>
}

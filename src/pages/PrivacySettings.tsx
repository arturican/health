import { useEffect, useRef, type SyntheticEvent } from 'react'
import { saveVisibility } from '../dataAccess'
import type { Visibility } from '../domain/visibility'
import { useVisibility } from '../ui/useVisibility'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'
import { Icon } from '../ui/Icon'

export function PrivacySettings() {
  const settings = useVisibility()
  const draft = useRef<Visibility | undefined>(undefined)
  const action = useAction()
  const button = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const focusAfterSave = useRef(false)
  useEffect(() => {
    if (!settings || !settings.current || settings.failed || draft.current) return
    for (const name of ['showPhotos', 'showDocuments'] as const) {
      const input = formRef.current?.elements.namedItem(name)
      if (input instanceof HTMLInputElement) input.checked = settings.value[name]
    }
  }, [settings])
  useEffect(() => {
    if (action.pending || !settings?.current || settings.failed || !focusAfterSave.current) return
    focusAfterSave.current = false
    button.current?.focus()
  }, [action.pending, settings])
  function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings || !settings.current || settings.failed) return
    const form = new FormData(event.currentTarget)
    draft.current ??= settings.value
    const original = draft.current
    focusAfterSave.current = true
    action.run(async () => {
      await saveVisibility({ version: 1, showPhotos: form.has('showPhotos'), showDocuments: form.has('showDocuments') }, original)
      draft.current = undefined
    }, 'Видимость разделов сохранена')
  }
  return <section className="card" aria-labelledby="visibility-title">
    <h2 id="visibility-title"><Icon name="settings" /> Видимость разделов</h2>
    <p>Скрытие убирает раздел из интерфейса. Записи и файлы сохраняются и входят в полную копию. Это не защита доступа и не шифрование.</p>
    {!settings ? <p role="status">Загружаем настройки видимости…</p> : <>
      {settings.failed && <p role="alert">Не удалось прочитать настройки видимости. Фото и документы скрыты. Повторите загрузку настроек перед сохранением.</p>}
      {settings.failed && <button type="button" onClick={() => { draft.current = undefined; settings.retry() }}>Повторить загрузку настроек</button>}
      <form ref={formRef} aria-label="Видимость разделов" onSubmit={save} onChange={() => { draft.current ??= settings.value }}>
        <fieldset disabled={action.pending || !settings.current || settings.failed}>
          <legend>Разделы дневника</legend>
          <Field label="Показывать фото" name="showPhotos" type="checkbox" defaultChecked={settings.value.showPhotos} />
          <Field label="Показывать документы и показатели" name="showDocuments" type="checkbox" defaultChecked={settings.value.showDocuments} />
        </fieldset>
        <button ref={button} type="submit" disabled={action.pending || !settings.current || settings.failed}>{action.pending ? 'Сохраняем видимость…' : 'Сохранить видимость'}</button>
      </form>
    </>}
    <Feedback error={action.error} message={action.message} />
  </section>
}

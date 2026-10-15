import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addPhoto, updatePhoto } from '../dataAccess'
import { photoInputSchema, type Photo } from '../domain/photo'
import { localDate } from '../domain/input'
import { validate } from '../domain/schema'
import { Field } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

interface PhotoFormProps { entry?: Photo | null; disabled?: boolean; onSaved?: () => void; onCancel?: () => void; onBusyChange?: (busy: boolean) => void }

export function PhotoForm({ entry = null, disabled = false, onSaved, onCancel, onBusyChange }: PhotoFormProps = {}) {
  const action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const focusAfterAttempt = useRef<string | null>(null)
  useEffect(() => { onBusyChange?.(action.pending) }, [action.pending, onBusyChange])
  useEffect(() => { if (entry) formRef.current?.querySelector<HTMLInputElement>('[name="date"]')?.focus() }, [entry])
  useEffect(() => {
    if (!action.pending && focusAfterAttempt.current) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${focusAfterAttempt.current}"]`)?.focus()
      focusAfterAttempt.current = null
    }
  }, [action.pending, revision])
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const date = readField(form, 'date', text => {
      const value = validate(photoInputSchema.shape.date, text)
      if (value > localDate()) throw new Error('Дата фото не может быть в будущем')
      return value
    }, fieldErrors)
    const title = readField(form, 'title', text => validate(photoInputSchema.shape.title, text), fieldErrors)
    const note = readField(form, 'note', text => validate(photoInputSchema.shape.note, text), fieldErrors)
    const file = form.get('file')
    if (!entry && (!(file instanceof Blob) || file.size === 0)) fieldErrors['file'] = 'Выберите файл фото'
    setErrors(fieldErrors)
    action.reset()
    if (date === null || title === null || note === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      try {
        if (entry) await updatePhoto(entry, { date, title, note })
        else await addPhoto({ date, title, note }, file)
      }
      catch (reason: unknown) {
        if (!entry && reason instanceof Error && reason.name === 'Error') setErrors({ file: reason.message })
        focusAfterAttempt.current = entry ? 'title' : 'file'
        throw reason
      }
      if (!entry) { focusAfterAttempt.current = 'title'; setRevision(value => value + 1) }
      onSaved?.()
    }, entry ? 'Фото обновлено' : 'Фото добавлено')
  }
  return <>
    <form key={revision} ref={formRef} className="form-grid" aria-label={entry ? 'Редактирование фото' : 'Добавление фото'} onSubmit={submit} noValidate>
      <fieldset disabled={action.pending || disabled}>
        <legend>{entry ? 'Параметры фото' : 'Новое фото'}</legend>
        <Field label="Дата фото" name="date" type="date" required max={localDate()} defaultValue={entry?.date ?? localDate()} error={errors['date']} />
        <Field label="Подпись фото" name="title" required maxLength={120} defaultValue={entry?.title ?? ''} error={errors['title']} />
        <Field label="Заметка к фото (необязательно)" name="note" maxLength={500} defaultValue={entry?.note ?? ''} error={errors['note']} />
        {!entry && <>
          <Field label="Файл фото" name="file" type="file" required accept="image/jpeg,image/png,image/webp" aria-describedby="photo-file-help" error={errors['file']} />
          <p id="photo-file-help">JPEG, PNG или WebP до 10 MiB, 64 млн пикселей и 32768 px по стороне. Фото сохраняется как JPEG без EXIF, максимум 2048 px по большей стороне. Пропорции сохраняются; прозрачность становится белым фоном.</p>
        </>}
      </fieldset>
      <div className="actions">
        <button type="submit" disabled={action.pending || disabled}>{action.pending ? 'Сохраняем…' : entry ? 'Сохранить фото' : 'Добавить фото'}</button>
        {entry && <button type="button" disabled={action.pending || disabled} onClick={onCancel}>Отменить правку фото</button>}
      </div>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}

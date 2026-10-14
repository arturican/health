import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addPhoto } from '../data/photoRepository'
import { photoInputSchema } from '../domain/photo'
import { localDate } from '../domain/input'
import { validate } from '../domain/schema'
import { Field } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

export function PhotoForm() {
  const action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const focusAfterAttempt = useRef<string | null>(null)
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
    if (!(file instanceof Blob) || file.size === 0) fieldErrors['file'] = 'Выберите файл фото'
    setErrors(fieldErrors)
    action.reset()
    if (date === null || title === null || note === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      try { await addPhoto({ date, title, note }, file) }
      catch (reason: unknown) {
        if (reason instanceof Error && reason.name === 'Error') setErrors({ file: reason.message })
        focusAfterAttempt.current = 'file'
        throw reason
      }
      focusAfterAttempt.current = 'title'
      setRevision(value => value + 1)
    }, 'Фото добавлено')
  }
  return <>
    <form key={revision} ref={formRef} className="form-grid" aria-label="Добавление фото" onSubmit={submit} noValidate>
      <fieldset disabled={action.pending}>
        <legend>Новое фото</legend>
        <Field label="Дата фото" name="date" type="date" required max={localDate()} defaultValue={localDate()} error={errors['date']} />
        <Field label="Подпись фото" name="title" required maxLength={120} error={errors['title']} />
        <Field label="Заметка к фото (необязательно)" name="note" maxLength={500} error={errors['note']} />
        <Field label="Файл фото" name="file" type="file" required accept="image/jpeg,image/png,image/webp" aria-describedby="photo-file-help" error={errors['file']} />
        <p id="photo-file-help">JPEG, PNG или WebP до 10 MiB, 64 млн пикселей и 32768 px по стороне. Фото сохраняется локально как JPEG без EXIF, максимум 2048 px по большей стороне. Пропорции сохраняются; прозрачность становится белым фоном.</p>
      </fieldset>
      <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : 'Добавить фото'}</button>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}

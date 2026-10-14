import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addDocument } from '../data/documentRepository'
import { documentInputSchema, documentKinds } from '../domain/document'
import { localDate } from '../domain/input'
import { validate } from '../domain/schema'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

export function DocumentForm() {
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
      const value = validate(documentInputSchema.shape.date, text)
      if (value > localDate()) throw new Error('Дата документа не может быть в будущем')
      return value
    }, fieldErrors)
    const title = readField(form, 'title', text => validate(documentInputSchema.shape.title, text), fieldErrors)
    const kind = readField(form, 'kind', text => validate(documentInputSchema.shape.kind, text), fieldErrors)
    const note = readField(form, 'note', text => validate(documentInputSchema.shape.note, text), fieldErrors)
    const file = form.get('file')
    if (!(file instanceof Blob) || file.size === 0) fieldErrors['file'] = 'Выберите файл документа'
    setErrors(fieldErrors)
    action.reset()
    if (date === null || title === null || kind === null || note === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      try { await addDocument({ date, title, kind, note }, file) }
      catch (reason: unknown) {
        if (reason instanceof Error && reason.name === 'Error') setErrors({ file: reason.message })
        focusAfterAttempt.current = 'file'
        throw reason
      }
      focusAfterAttempt.current = 'title'
      setRevision(value => value + 1)
    }, 'Документ добавлен')
  }
  return <>
    <form key={revision} ref={formRef} className="form-grid" aria-label="Добавление документа" onSubmit={submit} noValidate>
      <fieldset disabled={action.pending}>
        <legend>Новый документ</legend>
        <Field label="Дата документа" name="date" type="date" required max={localDate()} defaultValue={localDate()} error={errors['date']} />
        <Field label="Название документа" name="title" required maxLength={160} error={errors['title']} />
        <SelectField label="Категория документа" name="kind" defaultValue="lab" required error={errors['kind']}>
          {Object.entries(documentKinds).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </SelectField>
        <Field label="Заметка к документу (необязательно)" name="note" maxLength={500} error={errors['note']} />
        <Field label="Файл документа" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" aria-describedby="document-file-help" error={errors['file']} />
        <p id="document-file-help">PDF, JPEG, PNG или WebP до 20 MiB. Изображения — до 64 млн пикселей и 32768 px по стороне. Оригинал сохраняется локально без изменений, включая метаданные файла. Общий предел вложений — 100 MiB. PDF можно скачать и открыть в своей программе.</p>
      </fieldset>
      <button type="submit" disabled={action.pending}>{action.pending ? 'Сохраняем…' : 'Добавить документ'}</button>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}

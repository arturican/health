import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addDocument, updateDocument } from '../dataAccess'
import { documentInputSchema, documentKinds, type DiaryDocument } from '../domain/document'
import { localDate } from '../domain/input'
import { validate } from '../domain/schema'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

interface DocumentFormProps { entry?: DiaryDocument | null; disabled?: boolean; onSaved?: () => void; onCancel?: () => void; onBusyChange?: (busy: boolean) => void }
export function DocumentForm({ entry = null, disabled = false, onSaved, onCancel, onBusyChange }: DocumentFormProps = {}) {
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
      const value = validate(documentInputSchema.shape.date, text)
      if (value > localDate()) throw new Error('Дата документа не может быть в будущем')
      return value
    }, fieldErrors)
    const title = readField(form, 'title', text => validate(documentInputSchema.shape.title, text), fieldErrors)
    const kind = readField(form, 'kind', text => validate(documentInputSchema.shape.kind, text), fieldErrors)
    const note = readField(form, 'note', text => validate(documentInputSchema.shape.note, text), fieldErrors)
    const file = form.get('file')
    if (!entry && (!(file instanceof Blob) || file.size === 0)) fieldErrors['file'] = 'Выберите файл документа'
    setErrors(fieldErrors)
    action.reset()
    if (date === null || title === null || kind === null || note === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      try {
        if (entry) await updateDocument(entry, { date, title, kind, note })
        else await addDocument({ date, title, kind, note }, file)
      }
      catch (reason: unknown) {
        if (!entry && reason instanceof Error && reason.name === 'Error') setErrors({ file: reason.message })
        focusAfterAttempt.current = entry ? 'title' : 'file'
        throw reason
      }
      if (!entry) { focusAfterAttempt.current = 'title'; setRevision(value => value + 1) }
      onSaved?.()
    }, entry ? 'Документ обновлён' : 'Документ добавлен')
  }
  return <>
    <form key={revision} ref={formRef} className="form-grid" aria-label={entry ? 'Редактирование документа' : 'Добавление документа'} onSubmit={submit} noValidate>
      <fieldset disabled={action.pending || disabled}>
        <legend>{entry ? 'Параметры документа' : 'Новый документ'}</legend>
        <Field label="Дата документа" name="date" type="date" required max={localDate()} defaultValue={entry?.date ?? localDate()} error={errors['date']} />
        <Field label="Название документа" name="title" required maxLength={160} defaultValue={entry?.title ?? ''} error={errors['title']} />
        <SelectField label="Категория документа" name="kind" defaultValue={entry?.kind ?? 'lab'} required error={errors['kind']}>
          {Object.entries(documentKinds).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </SelectField>
        <Field label="Заметка к документу (необязательно)" name="note" maxLength={500} defaultValue={entry?.note ?? ''} error={errors['note']} />
        {!entry && <>
          <Field label="Файл документа" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" aria-describedby="document-file-help" error={errors['file']} />
          <p id="document-file-help">PDF, JPEG, PNG или WebP до 20 MiB. Изображения — до 64 млн пикселей и 32768 px по стороне. Оригинал сохраняется без изменений, включая метаданные файла. Общий предел вложений — 100 MiB. PDF можно скачать и открыть в своей программе.</p>
        </>}
      </fieldset>
      <div className="actions">
        <button type="submit" disabled={action.pending || disabled}>{action.pending ? 'Сохраняем…' : entry ? 'Сохранить документ' : 'Добавить документ'}</button>
        {entry && <button type="button" disabled={action.pending || disabled} onClick={onCancel}>Отменить правку документа</button>}
      </div>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}

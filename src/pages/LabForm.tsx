import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { addLabResult, updateLabResult } from '../dataAccess'
import { labInputSchema, labOperatorSchema, labOperators, labValueSchema, type LabResult } from '../domain/labResult'
import { localDate, parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { Field, SelectField } from '../ui/Field'
import { Feedback, readField, useAction } from '../ui/actions'

interface LabFormProps { documentId: string; defaultDate: string; disabled: boolean; onBusyChange: (busy: boolean) => void; entry?: LabResult | null; onSaved?: () => void; onCancel?: () => void }
export function LabForm({ documentId, defaultDate, disabled, onBusyChange, entry = null, onSaved, onCancel }: LabFormProps) {
  const action = useAction()
  const [valueType, setValueType] = useState<'number' | 'text'>(entry?.value.type ?? 'number')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const focusAfterAttempt = useRef(false)
  useEffect(() => { onBusyChange(action.pending); return () => { onBusyChange(false) } }, [action.pending, onBusyChange])
  useEffect(() => { if (entry) formRef.current?.querySelector<HTMLInputElement>('[name="date"]')?.focus() }, [entry])
  useEffect(() => {
    if (!action.pending && focusAfterAttempt.current) { focusAfterAttempt.current = false; formRef.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus() }
  }, [revision, action.pending])
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const date = readField(form, 'date', text => {
      const value = validate(labInputSchema.shape.date, text)
      if (value > localDate()) throw new Error('Дата показателя не может быть в будущем')
      return value
    }, fieldErrors)
    const name = readField(form, 'name', text => validate(labInputSchema.shape.name, text), fieldErrors)
    const operator = valueType === 'number' ? readField(form, 'operator', text => validate(labOperatorSchema, text), fieldErrors) : 'eq'
    const value = readField(form, 'value', text => validate(labValueSchema, valueType === 'number' ? { type: 'number', number: parseNumber(text), operator } : { type: 'text', text }), fieldErrors)
    const unit = readField(form, 'unit', text => validate(labInputSchema.shape.unit, text), fieldErrors)
    const reference = readField(form, 'reference', text => validate(labInputSchema.shape.reference, text), fieldErrors)
    const note = readField(form, 'note', text => validate(labInputSchema.shape.note, text), fieldErrors)
    setErrors(fieldErrors)
    action.reset()
    if (date === null || name === null || value === null || unit === null || reference === null || note === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      try {
        const values = { documentId, date, name, value, unit, reference, note }
        if (entry) await updateLabResult(entry, values)
        else await addLabResult(values)
      }
      catch (reason: unknown) { focusAfterAttempt.current = true; throw reason }
      if (!entry) { focusAfterAttempt.current = true; setValueType('number'); setRevision(current => current + 1) }
      onSaved?.()
    }, entry ? 'Показатель обновлён' : 'Показатель добавлен')
  }
  return <>
    <form key={revision} ref={formRef} className="form-grid" aria-label={entry ? 'Редактирование показателя' : 'Добавление показателя'} onSubmit={submit} noValidate>
      <fieldset disabled={action.pending || disabled}>
        <legend>{entry ? 'Параметры показателя' : 'Новый показатель'}</legend>
        <Field label="Дата показателя" name="date" type="date" defaultValue={entry?.date ?? defaultDate} required max={localDate()} error={errors['date']} />
        <Field label="Название показателя" name="name" required maxLength={120} defaultValue={entry?.name ?? ''} error={errors['name']} />
        <SelectField label="Формат результата" value={valueType} onChange={event => { setValueType(event.currentTarget.value === 'text' ? 'text' : 'number') }}><option value="number">Число</option><option value="text">Текст</option></SelectField>
        {valueType === 'number' && <SelectField label="Знак сравнения" name="operator" defaultValue={entry?.value.type === 'number' ? entry.value.operator : 'eq'} error={errors['operator']}>{Object.entries(labOperators).map(([key, label]) => <option key={key} value={key}>{label || 'Без знака'}</option>)}</SelectField>}
        <Field key={valueType} label={valueType === 'number' ? 'Результат числом' : 'Результат текстом'} name="value" required inputMode={valueType === 'number' ? 'decimal' : 'text'} maxLength={valueType === 'number' ? 32 : 120} defaultValue={entry?.value.type === valueType ? entry.value.type === 'number' ? entry.value.number : entry.value.text : ''} error={errors['value']} />
        <Field label="Единицы (необязательно)" name="unit" maxLength={40} defaultValue={entry?.unit ?? ''} error={errors['unit']} />
        <Field label="Референс как на бланке (необязательно)" name="reference" maxLength={160} defaultValue={entry?.reference ?? ''} error={errors['reference']} />
        <Field label="Заметка к показателю (необязательно)" name="note" maxLength={500} defaultValue={entry?.note ?? ''} error={errors['note']} />
      </fieldset>
      <div className="actions">
        <button type="submit" disabled={action.pending || disabled}>{action.pending ? 'Сохраняем…' : entry ? 'Сохранить показатель' : 'Добавить показатель'}</button>
        {entry && <button type="button" disabled={action.pending || disabled} onClick={onCancel}>Отменить правку показателя</button>}
      </div>
    </form>
    <Feedback error={action.error} message={action.message} />
  </>
}

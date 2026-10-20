import { useState, type SyntheticEvent } from 'react'
import { addProduct, updateProduct } from '../dataAccess'
import { snapshotSchema, type Product } from '../domain/nutrition'
import { parseNumber } from '../domain/input'
import { validate } from '../domain/schema'
import { Field } from '../ui/Field'
import { cancelEdit, Feedback, readField, useAction } from '../ui/actions'

const macros = { protein: 'Белки на 100 г, г (необязательно)', fat: 'Жиры на 100 г, г (необязательно)', carbs: 'Углеводы на 100 г, г (необязательно)' }

interface ProductFormProps {
  product?: Product
  onSaved?: () => void
  onCancel?: () => void
  disabled?: boolean
  onPendingChange?: (pending: boolean) => void
}

export function ProductForm({ product, onSaved, onCancel, disabled = false, onPendingChange }: ProductFormProps) {
  const action = useAction(onPendingChange)
  const busy = disabled || action.pending
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const fieldErrors: Record<string, string> = {}
    const name = readField(form, 'name', value => validate(snapshotSchema.shape.name, value), fieldErrors)
    const source = readField(form, 'source', value => validate(snapshotSchema.shape.source, value), fieldErrors)
    const kcal = readField(form, 'kcal', value => validate(snapshotSchema.shape.kcal, parseNumber(value)), fieldErrors)
    const protein = readField(form, 'protein', value => validate(snapshotSchema.shape.protein, parseNumber(value, { optional: true })), fieldErrors)
    const fat = readField(form, 'fat', value => validate(snapshotSchema.shape.fat, parseNumber(value, { optional: true })), fieldErrors)
    const carbs = readField(form, 'carbs', value => validate(snapshotSchema.shape.carbs, parseNumber(value, { optional: true })), fieldErrors)
    setErrors(fieldErrors)
    if (name === null || source === null || kcal === null || Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0]
      if (first) event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    action.run(async () => {
      const snapshot = { name, source, kcal, protein, fat, carbs }
      if (product) await updateProduct(product, snapshot)
      else await addProduct({ id: crypto.randomUUID(), ...snapshot, archived: false })
      setRevision(value => value + 1)
      onSaved?.()
    }, 'Продукт сохранён')
  }

  return (
    <>
      <h2>{product ? 'Редактирование продукта' : 'Новый продукт'}</h2>
      <form key={revision} className="form-grid" aria-label={product ? 'Редактирование продукта' : 'Новый продукт'} noValidate onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
          <legend>Значения на 100 г продукта</legend>
          <Field label="Название продукта" name="name" maxLength={120} defaultValue={product?.name ?? ''} required error={errors['name']} />
          <Field label="Калории на 100 г, ккал" name="kcal" inputMode="decimal" defaultValue={product?.kcal ?? ''} required error={errors['kcal']} />
          {(['protein', 'fat', 'carbs'] as const).map(key => <Field key={key} label={macros[key]} name={key} defaultValue={product?.[key] ?? ''} inputMode="decimal" error={errors[key]} />)}
          <Field label="Источник (необязательно)" name="source" maxLength={160} defaultValue={product?.source ?? ''} error={errors['source']} />
        </fieldset>
        <p>Перенесите данные с этикетки. Пустое поле БЖУ означает «неизвестно», а 0 — известный ноль.</p>
        {Object.keys(errors).length > 0 && <p role="alert">Проверьте отмеченные поля.</p>}
        <button type="submit" disabled={busy}>{action.pending ? 'Сохраняем…' : 'Сохранить продукт'}</button>
        {onCancel && <button type="button" className="secondary" disabled={action.pending} onClick={() => { cancelEdit(onCancel) }}>Отменить правку продукта</button>}
      </form>
      <Feedback error={Object.keys(errors).length > 0 ? null : action.error} message={Object.keys(errors).length > 0 ? null : action.message} />
    </>
  )
}

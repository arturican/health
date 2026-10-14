import { useId, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | undefined
}

export function SelectField({ label, error, id, children, ...select }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string | undefined }) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const descriptions = [select['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <select {...select} id={fieldId} aria-invalid={Boolean(error)} aria-describedby={descriptions || undefined}>{children}</select>
      {error && <span className="field-error" id={errorId}>{error}</span>}
    </div>
  )
}

export function Field({ label, error, id, ...input }: FieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const descriptions = [input['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input {...input} id={fieldId} aria-invalid={Boolean(error)}
        aria-describedby={descriptions || undefined} />
      {error && <span className="field-error" id={errorId}>{error}</span>}
    </div>
  )
}

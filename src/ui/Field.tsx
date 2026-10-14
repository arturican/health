import { useId, type InputHTMLAttributes } from 'react'

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
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

import { useEffect, useId, useRef } from 'react'

interface ConfirmationProps {
  question: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Confirmation({ question, pending, onConfirm, onCancel }: ConfirmationProps) {
  const id = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement
    cancel.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return (
    <div className="confirmation" role="alertdialog" aria-labelledby={id}>
      <p id={id}>{question}</p>
      <div className="actions">
        <button ref={cancel} type="button" className="secondary" disabled={pending} onClick={onCancel}>Отмена</button>
        <button type="button" disabled={pending} onClick={onConfirm}>Подтвердить удаление</button>
      </div>
    </div>
  )
}

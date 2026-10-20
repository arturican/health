import { useEffect, useId, useRef } from 'react'

interface ConfirmationProps {
  question: string
  pending: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Confirmation({ question, pending, confirmDisabled = false, onConfirm, onCancel }: ConfirmationProps) {
  const id = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const returnAfterConfirm = useRef(false)
  useEffect(() => {
    const previous = document.activeElement
    const main = previous instanceof HTMLElement ? previous.closest('main') : null
    cancel.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected && !previous.matches(':disabled')) previous.focus()
      else if (document.activeElement === document.body && main instanceof HTMLElement && main.isConnected) main.focus()
    }
  }, [])
  useEffect(() => {
    if (pending || !returnAfterConfirm.current) return
    returnAfterConfirm.current = false
    const active = document.activeElement
    if (active === document.body || dialog.current?.contains(active)) cancel.current?.focus()
  })
  return (
    <div ref={dialog} className="confirmation" role="alertdialog" aria-labelledby={id}>
      <p id={id}>{question}</p>
      <div className="actions">
        <button ref={cancel} type="button" className="secondary" disabled={pending} onClick={onCancel}>Отмена</button>
        <button type="button" disabled={pending || confirmDisabled} onClick={() => { returnAfterConfirm.current = true; onConfirm() }}>Подтвердить удаление</button>
      </div>
    </div>
  )
}

import { useRef, useState } from 'react'

export interface ActionStatus {
  pending: boolean
  error: string | null
  message: string | null
}

export function formText(form: FormData, name: string): string {
  const value = form.get(name)
  if (typeof value !== 'string') throw new Error('Поле не заполнено')
  return value.trim()
}

export function useAction() {
  const [status, setStatus] = useState<ActionStatus>({ pending: false, error: null, message: null })
  const busy = useRef(false)

  function run(task: () => Promise<void> | void, message = 'Сохранено') {
    if (busy.current) return
    busy.current = true
    setStatus({ pending: true, error: null, message: null })
    void Promise.resolve().then(task).then(() => {
      setStatus({ pending: false, error: null, message })
    }).catch((reason: unknown) => {
      setStatus({ pending: false, error: reason instanceof Error ? reason.message : 'Не удалось выполнить действие', message: null })
    }).finally(() => {
      busy.current = false
    })
  }

  return { ...status, run }
}

export function Feedback({ error, message }: Pick<ActionStatus, 'error' | 'message'>) {
  if (error) return <p role="alert" className="field-error">{error}</p>
  if (message) return <p role="status">{message}</p>
  return null
}

import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'
import { getClientSession } from './session'
import { bindEmail, boundEmail, readBoundEmail } from './emailRecovery'

export function EmailBinding() {
  const { session } = getClientSession(), action = useAction(), form = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<z.infer<typeof boundEmail> | null>(null)
  const [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!session) return
    let active = true
    void readBoundEmail().then(value => { if (active) { setStatus(value); setError(null) } }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Не удалось проверить почту.')
    })
    return () => { active = false }
  }, [session, attempt])
  if (!session) return null
  return <section className="card" aria-labelledby="binding-title" style={{ overflowWrap: 'anywhere' }}><h2 id="binding-title">Почта и восстановление доступа</h2>
    {error ? <><p role="alert">{error}</p><button type="button" onClick={() => { setAttempt(value => value + 1) }}>Повторить проверку почты</button></>
      : !status ? <p role="status">Проверяем почту…</p> : status.email ? <p>{status.email} — {status.verified ? 'подтверждена' : 'ожидает подтверждения'}.</p> : <>
        <p>Привяжите почту, чтобы восстанавливать доступ. По ссылке из письма вы зададите пароль; все устройства выйдут из аккаунта.</p>
        <form ref={form} className="auth-form" aria-label="Привязка почты" onSubmit={event => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          action.run(async () => { await bindEmail({ email: data.get('email'), password: data.get('password') }); form.current?.reset() },
            'Если привязка доступна, письмо отправлено. Проверьте почту и папку «Спам». Повторная отправка — через минуту.')
        }}>
          <Field label="Почта для восстановления" name="email" type="email" autoComplete="email" required maxLength={254} disabled={action.pending} />
          <Field label="Текущий пароль" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={action.pending} />
          <button type="submit" disabled={action.pending}>{action.pending ? 'Отправляем…' : 'Подтвердить почту'}</button>
        </form><Feedback error={action.error} message={action.message} />
      </>}
  </section>
}

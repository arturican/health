import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { emailPurpose, emailSchema, emailToken } from '../domain/emailAccount'
import { passwordSchema } from '../domain/registration'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'
import { completeEmail, requestRecovery } from './emailRecovery'

export type RecoveryMode = 'request' | 'verify_request' | 'finished' | { purpose: 'verify_email' | 'reset_password'; token: string; valid: boolean }
export function readPasswordLink(): RecoveryMode | null {
  const params = new URLSearchParams(window.location.hash.slice(1))
  if (!params.has('auth')) return null
  const purpose = emailPurpose.safeParse(params.get('auth')), token = emailToken.safeParse(params.get('token'))
  return purpose.success && token.success ? { purpose: purpose.data, token: token.data, valid: true }
    : { purpose: purpose.success ? purpose.data : 'reset_password', token: '', valid: false }
}

export function PasswordRecovery({ mode, onBack, onRequest, onFinished }: {
  mode: RecoveryMode; onBack: () => void; onRequest: () => void; onFinished: () => void
}) {
  const form = useRef<HTMLFormElement>(null), action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({}), [show, setShow] = useState(false)
  const link = typeof mode === 'object' ? mode : null
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('input')?.focus() }, [])
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); action.reset()
    const data = new FormData(event.currentTarget), next: Record<string, string> = {}
    if (link) {
      if (!passwordSchema.safeParse(data.get('password')).success) next.password = 'Пароль должен содержать от 15 до 1024 символов.'
      if (data.get('password') !== data.get('confirmation')) next.confirmation = 'Пароли должны совпадать.'
    } else if (!emailSchema.safeParse(data.get('email')).success) next.email = 'Введите почту вида name@example.com.'
    setErrors(next)
    if (Object.keys(next).length) { form.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0] ?? 'email'}"]`)?.focus(); return }
    action.run(async () => {
      if (link) { await completeEmail({ token: link.token, purpose: link.purpose, password: data.get('password') }); onFinished() }
      else await requestRecovery({ email: data.get('email'), purpose: mode === 'verify_request' ? 'verify_email' : 'reset_password' })
    }, 'Если запрос доступен для этой почты, письмо со ссылкой отправлено. Проверьте папку «Спам». Повторная отправка — через минуту.')
  }
  const title = mode === 'finished' ? 'Пароль сохранён' : link ? 'Задайте новый пароль' : mode === 'verify_request' ? 'Подтверждение почты' : 'Восстановление доступа'
  return <main className="page auth-page"><section className="card auth-card" aria-labelledby="recovery-title">
    <h1 id="recovery-title">{title}</h1>
    {mode === 'finished' ? <p role="status">Почта подтверждена, пароль сохранён. Войдите снова. Прежние сессии завершены.</p>
      : link && !link.valid ? <p role="alert">Ссылка недействительна. Запросите новую.</p> : <>
        <p>{link ? 'Задайте пароль для входа. Прежние сессии будут завершены.' : mode === 'verify_request' ? 'Введите почту незавершённой регистрации. Для повторной привязки почты к прежнему аккаунту войдите и отправьте письмо из настроек.' : 'Введите подтверждённую почту аккаунта. Если раньше входили по логину, сначала привяжите почту в настройках.'}</p>
        <form ref={form} className="auth-form" aria-label={link ? 'Задание нового пароля' : title} onSubmit={submit} noValidate>
          {link ? <>
            <Field label="Новый пароль" name="password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={15} maxLength={1024}
              aria-describedby="new-password-help" error={errors.password} disabled={action.pending} />
            <p id="new-password-help">От 15 до 1024 символов. Можно использовать фразу; пробелы сохраняются.</p>
            <Field label="Повторите пароль" name="confirmation" type={show ? 'text' : 'password'} autoComplete="new-password" required maxLength={1024}
              error={errors.confirmation} disabled={action.pending} />
            <button type="button" className="secondary" aria-pressed={show} disabled={action.pending} onClick={() => { setShow(value => !value) }}>Показать пароли</button>
          </> : <Field label="Почта" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} error={errors.email} disabled={action.pending} />}
          <button type="submit" disabled={action.pending}>{action.pending ? 'Подождите…' : link ? 'Сохранить пароль' : 'Отправить ссылку'}</button>
        </form><Feedback error={action.error} message={action.message} />
      </>}
    {link && <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onRequest}>Запросить новую ссылку</button>}
    {mode === 'verify_request' && <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onRequest}>Уже задавали пароль? Восстановить доступ</button>}
    <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onBack}>Перейти ко входу</button>
  </section></main>
}

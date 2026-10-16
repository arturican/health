import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { emailRegistration } from '../domain/emailAccount'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'
import { register } from './auth'

function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
  catch { return 'UTC' }
}

export function RegistrationForm({ onCancel }: { onCancel: () => void }) {
  const form = useRef<HTMLFormElement>(null), action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [timezone] = useState(browserTimezone)
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus() }, [])

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const input = { email: data.get('email'), timezone: data.get('timezone') }
    const next: Record<string, string> = {}
    if (!emailRegistration.shape.email.safeParse(input.email).success) next.email = 'Введите почту вида name@example.com.'
    if (!emailRegistration.shape.timezone.safeParse(input.timezone).success) next.timezone = 'Укажите часовой пояс, например Europe/Moscow или UTC.'
    setErrors(next)
    action.reset()
    if (Object.keys(next).length) {
      form.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0] ?? 'email'}"]`)?.focus()
      return
    }
    action.run(() => register(input), 'Если регистрация доступна, письмо со ссылкой отправлено. Проверьте почту и папку «Спам». Повторная отправка — через минуту.')
  }

  return <main className="page auth-page"><section className="card auth-card" aria-labelledby="registration-title">
    <h1 id="registration-title">Регистрация</h1>
    <p>Введите почту. Мы пришлём ссылку для подтверждения адреса и создания пароля.</p>
    <form ref={form} className="auth-form" aria-label="Регистрация" onSubmit={submit} noValidate>
      <Field label="Почта" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254}
        error={errors.email} disabled={action.pending} />
      <Field label="Часовой пояс дневника" name="timezone" defaultValue={timezone} required maxLength={80}
        aria-describedby="registration-timezone-help" error={errors.timezone} disabled={action.pending} />
      <p id="registration-timezone-help">Определён по браузеру. Влияет на календарный день записей; пример: Europe/Moscow или UTC.</p>
      <button type="submit" disabled={action.pending}>{action.pending ? 'Отправляем…' : 'Отправить ссылку'}</button>
    </form>
    <Feedback error={action.error} message={action.message} />
    <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onCancel}>Уже есть аккаунт? Войти</button>
  </section></main>
}

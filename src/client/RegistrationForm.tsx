import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { registrationSchema } from '../domain/registration'
import { Field } from '../ui/Field'
import { Feedback, useAction } from '../ui/actions'
import { register } from './auth'

function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
  catch { return 'UTC' }
}

export function RegistrationForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (login: string) => void }) {
  const form = useRef<HTMLFormElement>(null), action = useAction()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [timezone] = useState(browserTimezone)
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('[name="login"]')?.focus() }, [])

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const input = { login: data.get('login'), password: data.get('password'), timezone: data.get('timezone') }
    const next: Record<string, string> = {}
    if (!registrationSchema.shape.login.safeParse(input.login).success) next.login = 'Введите 3–64 символа: латинские буквы, цифры, точка, дефис или подчёркивание. Начните с буквы или цифры.'
    if (!registrationSchema.shape.password.safeParse(input.password).success) next.password = 'Пароль должен содержать от 15 до 1024 символов.'
    if (!registrationSchema.shape.timezone.safeParse(input.timezone).success) next.timezone = 'Укажите часовой пояс, например Europe/Moscow или UTC.'
    if (!data.get('confirmation') || data.get('confirmation') !== input.password) next.confirmation = 'Пароли должны совпадать.'
    setErrors(next)
    action.reset()
    if (Object.keys(next).length) {
      form.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0] ?? 'login'}"]`)?.focus()
      return
    }
    action.run(async () => { const account = await register(input); onCreated(account.login) })
  }

  return <main className="page auth-page"><section className="card auth-card" aria-labelledby="registration-title">
    <h1 id="registration-title">Регистрация</h1>
    <p>Создайте аккаунт для своего дневника. Записи хранятся на сервере и доступны после входа.</p>
    <form ref={form} className="auth-form" aria-label="Регистрация" onSubmit={submit} noValidate>
      <Field label="Логин" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64}
        aria-describedby="registration-login-help" error={errors.login} disabled={action.pending} />
      <p id="registration-login-help">От 3 до 64 символов: латинские буквы, цифры, точка, дефис и подчёркивание.</p>
      <Field label="Пароль" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={15} maxLength={1024}
        aria-describedby="registration-password-help" error={errors.password} disabled={action.pending} />
      <p id="registration-password-help">От 15 до 1024 символов. Можно использовать длинную фразу; пробелы сохраняются.</p>
      <Field label="Повторите пароль" name="confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required maxLength={1024}
        error={errors.confirmation} disabled={action.pending} />
      <button type="button" className="secondary" aria-pressed={showPassword} disabled={action.pending} onClick={() => { setShowPassword(value => !value) }}>Показать пароли</button>
      <Field label="Часовой пояс дневника" name="timezone" defaultValue={timezone} required maxLength={80}
        aria-describedby="registration-timezone-help" error={errors.timezone} disabled={action.pending} />
      <p id="registration-timezone-help">Определён по браузеру. Влияет на календарный день записей; пример: Europe/Moscow или UTC.</p>
      <button type="submit" disabled={action.pending}>{action.pending ? 'Создаём аккаунт…' : 'Создать аккаунт'}</button>
    </form>
    <Feedback error={action.error} message={null} />
    <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onCancel}>Уже есть аккаунт? Войти</button>
  </section></main>
}

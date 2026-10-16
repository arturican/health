import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren, type SyntheticEvent } from 'react'
import { getClientSession, setClientSession, subscribeSession } from './session'
import { listenAccountChanges } from './accountChanges'
import { login, logout, restoreSession } from './auth'
import { Feedback, useAction } from '../ui/actions'
import { Field } from '../ui/Field'
import './auth.css'
import { RegistrationForm } from './RegistrationForm'

export function AuthBoundary({ children }: PropsWithChildren) {
  const state = useSyncExternalStore(subscribeSession, getClientSession)
  const [checking, setChecking] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => listenAccountChanges(() => {
    setClientSession(null)
    setError(null)
    setChecking(true)
    setAttempt(value => value + 1)
  }), [])
  useEffect(() => {
    let active = true
    void restoreSession().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Не удалось проверить вход.')
    }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [attempt])
  if (state.session && state.diary) return <Fragment key={state.epoch}>{children}</Fragment>
  if (checking) return <main className="page auth-page"><section className="card auth-card"><p role="status">Проверяем вход…</p></section></main>
  if (error) return <main className="page auth-page"><section className="card auth-card"><h1>Не удалось открыть дневник</h1><p role="alert">{error}</p>
    <button type="button" onClick={() => { setError(null); setChecking(true); setAttempt(value => value + 1) }}>Повторить подключение</button></section></main>
  return <EntryForms />
}

function EntryForms() {
  const [registering, setRegistering] = useState(false)
  const [registeredLogin, setRegisteredLogin] = useState('')
  return registering ? <RegistrationForm onCancel={() => { setRegistering(false) }} onCreated={login => {
    setRegisteredLogin(login); setRegistering(false)
  }} /> : <LoginForm registeredLogin={registeredLogin} onRegister={() => { setRegisteredLogin(''); setRegistering(true) }} />
}

function LoginForm({ registeredLogin, onRegister }: { registeredLogin: string; onRegister: () => void }) {
  const action = useAction(), form = useRef<HTMLFormElement>(null)
  useEffect(() => { form.current?.querySelector<HTMLInputElement>(registeredLogin ? '[name="password"]' : '[name="login"]')?.focus() }, [registeredLogin])
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    action.run(() => login({ login: data.get('login'), password: data.get('password') }))
  }
  return <main className="page auth-page"><section className="card auth-card" aria-labelledby="login-title">
    <h1 id="login-title">Вход в дневник</h1><p>Введите логин и пароль своего аккаунта.</p>
    {registeredLogin && <p role="status">Аккаунт создан. Введите пароль, чтобы войти.</p>}
    <form className="auth-form" ref={form} onSubmit={submit} aria-label="Вход в дневник">
      <Field label="Логин" name="login" autoComplete="username" defaultValue={registeredLogin} required maxLength={64} disabled={action.pending} />
      <Field label="Пароль" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={action.pending} />
      <button type="submit" disabled={action.pending}>{action.pending ? 'Входим…' : 'Войти'}</button>
    </form><Feedback error={action.error} message={null} />
    <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onRegister}>Зарегистрироваться</button>
  </section></main>
}

export function SessionControls() {
  const { session } = useSyncExternalStore(subscribeSession, getClientSession)
  const action = useAction()
  if (!session) return null
  return <div className="actions" aria-label="Аккаунт"><span>{session.account.login}</span>
    <button type="button" disabled={action.pending} onClick={() => { action.run(logout) }}>{action.pending ? 'Выходим…' : 'Выйти'}</button>
    <Feedback error={action.error} message={null} />
  </div>
}

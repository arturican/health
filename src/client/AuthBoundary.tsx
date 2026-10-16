import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren, type SyntheticEvent } from 'react'
import { getClientSession, setClientSession, subscribeSession } from './session'
import { listenAccountChanges } from './accountChanges'
import { login, logout, restoreSession } from './auth'
import { Feedback, useAction } from '../ui/actions'
import { Field } from '../ui/Field'
import './auth.css'
import { RegistrationForm } from './RegistrationForm'
import { PasswordRecovery, readPasswordLink, type RecoveryMode } from './PasswordRecovery'

export function AuthBoundary({ children }: PropsWithChildren) {
  const state = useSyncExternalStore(subscribeSession, getClientSession)
  const [checking, setChecking] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<RecoveryMode | null>(readPasswordLink)
  const [linkVersion, setLinkVersion] = useState(0)
  useEffect(() => {
    const changed = () => { const value = readPasswordLink(); if (value) {
      setClientSession(null); setLinkVersion(version => version + 1); setRecovery(value)
    } }
    window.addEventListener('hashchange', changed)
    return () => { window.removeEventListener('hashchange', changed) }
  }, [])
  useEffect(() => {
    if (typeof recovery === 'object' && recovery) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [recovery])
  useEffect(() => listenAccountChanges(() => {
    setClientSession(null)
    setError(null)
    setChecking(true)
    setAttempt(value => value + 1)
  }), [])
  useEffect(() => {
    if (recovery) return
    let active = true
    void restoreSession().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Не удалось проверить вход.')
    }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [attempt, recovery])
  if (recovery) return <PasswordRecovery key={typeof recovery === 'string' ? recovery : 'link-' + String(linkVersion)} mode={recovery}
    onBack={() => { setError(null); setChecking(true); setRecovery(null) }}
    onRequest={() => { setRecovery(typeof recovery === 'object' && recovery.purpose === 'verify_email' ? 'verify_request' : 'request') }}
    onFinished={() => { setRecovery('finished') }} />
  if (state.session && state.diary) return <Fragment key={state.epoch}>{children}</Fragment>
  if (checking) return <main className="page auth-page"><section className="card auth-card"><p role="status">Проверяем вход…</p></section></main>
  if (error) return <main className="page auth-page"><section className="card auth-card"><h1>Не удалось открыть дневник</h1><p role="alert">{error}</p>
    <button type="button" onClick={() => { setError(null); setChecking(true); setAttempt(value => value + 1) }}>Повторить подключение</button></section></main>
  return <EntryForms onRecover={() => { setRecovery('request') }} />
}

function EntryForms({ onRecover }: { onRecover: () => void }) {
  const [registering, setRegistering] = useState(false)
  return registering ? <RegistrationForm onCancel={() => { setRegistering(false) }} />
    : <LoginForm onRegister={() => { setRegistering(true) }} onRecover={onRecover} />
}

function LoginForm({ onRegister, onRecover }: { onRegister: () => void; onRecover: () => void }) {
  const action = useAction(), form = useRef<HTMLFormElement>(null)
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('[name="login"]')?.focus() }, [])
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    action.run(() => login({ login: data.get('login'), password: data.get('password') }))
  }
  return <main className="page auth-page"><section className="card auth-card" aria-labelledby="login-title">
    <h1 id="login-title">Вход в дневник</h1><p>Введите почту и пароль. Для прежнего аккаунта подходит старый логин.</p>
    <form className="auth-form" ref={form} onSubmit={submit} aria-label="Вход в дневник">
      <Field label="Почта" name="login" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={action.pending} />
      <Field label="Пароль" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={action.pending} />
      <button type="submit" disabled={action.pending}>{action.pending ? 'Входим…' : 'Войти'}</button>
    </form><Feedback error={action.error} message={null} />
    <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onRecover}>Забыли пароль?</button>
    <button type="button" className="secondary auth-switch" disabled={action.pending} onClick={onRegister}>Зарегистрироваться</button>
  </section></main>
}

export function SessionControls() {
  const { session } = useSyncExternalStore(subscribeSession, getClientSession)
  const action = useAction()
  if (!session) return null
  return <div className="actions" aria-label="Аккаунт"><span>{session.account.email ?? (session.account.login.startsWith('email-') ? 'Аккаунт' : session.account.login)}</span>
    <button type="button" disabled={action.pending} onClick={() => { action.run(logout) }}>{action.pending ? 'Выходим…' : 'Выйти'}</button>
    <Feedback error={action.error} message={null} />
  </div>
}

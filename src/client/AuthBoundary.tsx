import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren, type SyntheticEvent } from 'react'
import { getClientSession, setClientSession, subscribeSession } from './session'
import { listenAccountChanges } from './accountChanges'
import { login, logout, restoreSession } from './auth'
import { Feedback, useAction } from '../ui/actions'
import { Field } from '../ui/Field'

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
  if (checking) return <main className="page"><p role="status">Проверяем вход…</p></main>
  if (error) return <main className="page"><h1>Не удалось открыть дневник</h1><p role="alert">{error}</p>
    <button type="button" onClick={() => { setError(null); setChecking(true); setAttempt(value => value + 1) }}>Повторить подключение</button></main>
  return <LoginForm />
}

function LoginForm() {
  const action = useAction(), form = useRef<HTMLFormElement>(null)
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('[name="login"]')?.focus() }, [])
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    action.run(() => login({ login: data.get('login'), password: data.get('password') }))
  }
  return <main className="page"><section className="card" aria-labelledby="login-title">
    <h1 id="login-title">Вход в дневник</h1><p>Используйте выданные вам логин и пароль.</p>
    <form ref={form} onSubmit={submit} aria-label="Вход в дневник">
      <Field label="Логин" name="login" autoComplete="username" required maxLength={64} disabled={action.pending} />
      <Field label="Пароль" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={action.pending} />
      <button type="submit" disabled={action.pending}>{action.pending ? 'Входим…' : 'Войти'}</button>
    </form><Feedback error={action.error} message={null} />
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

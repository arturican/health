import { z } from 'zod'
import { loginSchema, sessionSchema, type Session } from '../domain/session'
import { ApiError, requestApi, requestJSON } from './http'
import { diaryStateSchema, getClientSession, setClientSession } from './session'

let restoring: Promise<void> | null = null
function assertEpoch(epoch: number) {
  if (getClientSession().epoch !== epoch) throw new Error('Вход изменился. Повторите действие.')
}
async function publish(session: Session, epoch: number) {
  assertEpoch(epoch)
  const diary = await requestJSON('/api/v1/diary-state', diaryStateSchema, { anonymous: true })
  assertEpoch(epoch)
  setClientSession(session, diary)
}

export function restoreSession(): Promise<void> {
  const current = getClientSession()
  if (current.session && current.diary) return Promise.resolve()
  if (restoring) return restoring
  restoring = (async () => {
    try { await publish(await requestJSON('/api/v1/auth/session', sessionSchema, { anonymous: true }), current.epoch) }
    catch (error) {
      assertEpoch(current.epoch)
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      setClientSession(null)
    }
  })().finally(() => { restoring = null })
  return restoring
}

export async function login(input: unknown) {
  const epoch = getClientSession().epoch
  const values = z.strictObject({ login: loginSchema, password: z.string().min(1).max(1024) }).safeParse(input)
  if (!values.success) throw new Error('Введите логин и пароль. В логине допустимы латинские буквы, цифры, точка, дефис и подчёркивание.')
  let session: Session
  try { session = await requestJSON('/api/v1/auth/login', sessionSchema, { method: 'POST', value: values.data, anonymous: true }) }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error('Неверный логин или пароль.')
    throw error
  }
  await publish(session, epoch)
}

export async function logout() {
  const epoch = getClientSession().epoch
  try {
    await requestApi('/api/v1/auth/logout', response => {
      if (response.status !== 204) throw new ApiError(500)
      return Promise.resolve(null)
    }, { method: 'POST' })
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    return
  }
  assertEpoch(epoch)
  setClientSession(null)
}

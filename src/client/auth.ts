import { z } from 'zod'
import { sessionSchema, type Session } from '../domain/session'
import { emailAccepted, emailRegistration, loginIdentity } from '../domain/emailAccount'
import { ApiError, requestApi, requestJSON } from './http'
import { diaryStateSchema, getClientSession, setClientSession } from './session'
import { notifyAccountChange } from './accountChanges'

let restoring: { epoch: number, promise: Promise<void> } | null = null
function assertEpoch(epoch: number) {
  if (getClientSession().epoch !== epoch) throw new Error('Вход изменился. Повторите действие.')
}
async function publish(session: Session, epoch: number) {
  assertEpoch(epoch)
  const diary = await requestJSON('/api/v1/diary-state', diaryStateSchema, { anonymous: true, expectedAccountId: session.account.id })
  assertEpoch(epoch)
  setClientSession(session, diary)
}

export function restoreSession(): Promise<void> {
  const current = getClientSession()
  if (current.session && current.diary) return Promise.resolve()
  if (restoring?.epoch === current.epoch) return restoring.promise
  const promise = (async () => {
    try { await publish(await requestJSON('/api/v1/auth/session', sessionSchema, { anonymous: true }), current.epoch) }
    catch (error) {
      assertEpoch(current.epoch)
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      setClientSession(null)
    }
  })().finally(() => { if (restoring?.epoch === current.epoch) restoring = null })
  restoring = { epoch: current.epoch, promise }
  return promise
}

export async function login(input: unknown) {
  const epoch = getClientSession().epoch
  const values = z.strictObject({ login: loginIdentity, password: z.string().min(1).max(1024) }).safeParse(input)
  if (!values.success) throw new Error('Введите почту и пароль. Для прежнего аккаунта можно использовать старый логин.')
  let session: Session
  try { session = await requestJSON('/api/v1/auth/login', sessionSchema, { method: 'POST', value: values.data, anonymous: true }) }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error('Неверная почта или пароль.')
    throw error
  }
  await publish(session, epoch)
  notifyAccountChange()
}

export async function register(input: unknown) {
  const values = emailRegistration.safeParse(input)
  if (!values.success) throw new Error('Проверьте данные регистрации.')
  await requestJSON('/api/v1/auth/email/register', emailAccepted, { method: 'POST', value: values.data, anonymous: true })
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
    notifyAccountChange()
    return
  }
  assertEpoch(epoch)
  setClientSession(null)
  notifyAccountChange()
}

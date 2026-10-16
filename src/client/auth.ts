import { z } from 'zod'
import { accountSchema, loginSchema, sessionSchema, type Session } from '../domain/session'
import { registrationSchema } from '../domain/registration'
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
  const values = z.strictObject({ login: loginSchema, password: z.string().min(1).max(1024) }).safeParse(input)
  if (!values.success) throw new Error('Введите логин и пароль. В логине допустимы латинские буквы, цифры, точка, дефис и подчёркивание.')
  let session: Session
  try { session = await requestJSON('/api/v1/auth/login', sessionSchema, { method: 'POST', value: values.data, anonymous: true }) }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error('Неверный логин или пароль.')
    throw error
  }
  await publish(session, epoch)
  notifyAccountChange()
}

export async function register(input: unknown) {
  const values = registrationSchema.safeParse(input)
  if (!values.success) throw new Error('Проверьте данные регистрации.')
  try {
    const result = await requestJSON('/api/v1/auth/register', z.strictObject({ account: accountSchema }), {
      method: 'POST', value: values.data, anonymous: true,
    })
    return result.account
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw new Error('Этот логин уже занят. Выберите другой или войдите.')
    throw error
  }
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

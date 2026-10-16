import { z } from 'zod'
import { emailAccepted, emailAddress, emailCompletion, emailRequest, emailSchema } from '../domain/emailAccount'
import { passwordSchema } from '../domain/registration'
import { ApiError, requestJSON } from './http'
import { setClientSession } from './session'
import { notifyAccountChange } from './accountChanges'

export const boundEmail = z.strictObject({ email: emailAddress.nullable(), verified: z.boolean() })
export const bindingSchema = z.strictObject({ email: emailSchema, password: passwordSchema })
export async function requestRecovery(input: unknown) {
  const parsed = emailRequest.safeParse(input)
  if (!parsed.success) throw new Error('Введите почту вида name@example.com.')
  await requestJSON('/api/v1/auth/email/request', emailAccepted, { method: 'POST', value: parsed.data, anonymous: true })
}
export async function completeEmail(input: unknown) {
  const parsed = emailCompletion.safeParse(input)
  if (!parsed.success) throw new Error('Проверьте ссылку и пароль (15–1024 символа).')
  try {
    await requestJSON('/api/v1/auth/email/complete', emailAccepted, { method: 'POST', value: parsed.data, anonymous: true })
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) throw new Error('Ссылка недействительна или истекла. Запросите новую.')
    throw error
  }
  setClientSession(null)
  notifyAccountChange()
}
export const readBoundEmail = () => requestJSON('/api/v1/auth/email', boundEmail)
export async function bindEmail(input: unknown) {
  const parsed = bindingSchema.safeParse(input)
  if (!parsed.success) throw new Error('Проверьте почту и текущий пароль.')
  try { await requestJSON('/api/v1/auth/email/bind', emailAccepted, { method: 'POST', value: parsed.data }) }
  catch (error) {
    if (error instanceof ApiError && error.status === 400) throw new Error('Проверьте почту и текущий пароль.')
    throw error
  }
}

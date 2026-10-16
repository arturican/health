import { z } from 'zod'
import { passwordSchema } from './registration'
import { timezoneSchema } from './session'

export const emailAddress = z.string().max(254).refine(value => (value.split('@')[0]?.length ?? 0) <= 64)
  .regex(/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/)
export const emailSchema = z.string().trim().transform(value => {
  const at = value.lastIndexOf('@')
  if (at < 0) return value
  return value.slice(0, at) + '@' + value.slice(at + 1).toLowerCase()
}).pipe(emailAddress)
export const emailRegistration = z.strictObject({ email: emailSchema, timezone: timezoneSchema })
export const emailPurpose = z.enum(['verify_email', 'reset_password'])
export const emailRequest = z.strictObject({ email: emailSchema, purpose: emailPurpose })
export const emailToken = z.string().regex(/^[a-f0-9]{64}$/)
export const emailCompletion = z.strictObject({ token: emailToken, purpose: emailPurpose, password: passwordSchema })
export const emailAccepted = z.strictObject({ accepted: z.literal(true) })

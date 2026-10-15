import { z } from 'zod'

export const loginSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,63}$/)
export const timezoneSchema = z.string().max(80).refine(value => {
  if (!/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value)) return false
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true }
  catch { return false }
})
export const accountSchema = z.strictObject({ id: z.uuid(), login: loginSchema, timezone: timezoneSchema })
export const sessionSchema = z.strictObject({ account: accountSchema, csrf: z.string().regex(/^[a-f0-9]{64}$/) })
export type Account = z.infer<typeof accountSchema>
export type Session = z.infer<typeof sessionSchema>

import { z } from 'zod'
import { loginSchema, timezoneSchema } from './session'

export const passwordSchema = z.string().min(15).max(1024)
export const registrationSchema = z.strictObject({ login: loginSchema, password: passwordSchema, timezone: timezoneSchema })

import { z } from 'zod'
import { ru } from 'zod/locales'
import { parseDate } from './input'

z.config(ru())

export const calendarDate = z.string({ error: 'Введите дату строкой' }).refine(value => {
  try {
    parseDate(value)
    return true
  } catch {
    return false
  }
}, 'Некорректная календарная дата')

export const entityId = z.uuid({ error: 'Некорректный идентификатор записи' })

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  throw new Error(issue?.code === 'unrecognized_keys' ? 'Неизвестные поля записи' : issue?.message ?? 'Проверьте введённые данные')
}

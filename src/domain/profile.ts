import { z } from 'zod'
import { calendarDate, entityId, validate } from './schema'
import { localDate } from './input'

export const profileSchema = z.strictObject({
  id: z.literal('self', { error: 'Некорректный профиль' }),
  name: z.string({ error: 'Введите имя строкой' }).trim().max(80, 'Имя слишком длинное'),
  heightCm: z.number({ error: 'Введите рост числом' }).positive('Рост должен быть больше нуля').max(300, 'Проверьте рост: максимум 300 см'),
  birthDate: calendarDate.nullable().refine(value => value === null || value <= localDate(), 'Дата рождения не может быть в будущем'),
  formulaSex: z.enum(['none', 'male', 'female'], { error: 'Выберите параметр формулы расхода' }),
})

export const weightSchema = z.strictObject({
  id: entityId,
  date: calendarDate,
  kg: z.number({ error: 'Введите вес числом' }).positive('Вес должен быть больше нуля').max(600, 'Проверьте вес: максимум 600 кг'),
})

export type Profile = z.infer<typeof profileSchema>
export type Weight = z.infer<typeof weightSchema>

export function readProfile(value: unknown): Profile {
  return validate(profileSchema, value)
}

export function readWeight(value: unknown): Weight {
  return validate(weightSchema, value)
}

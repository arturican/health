import { z } from 'zod'
import { calendarDate, entityId, validate } from './schema'

export const stepsSchema = z.strictObject({
  date: calendarDate,
  count: z.number({ error: 'Введите шаги числом' }).int('Введите целое число шагов').min(0, 'Шаги не могут быть отрицательными').max(1000000, 'Технический предел: 1 000 000 шагов'),
})
export type Steps = z.infer<typeof stepsSchema>

export function readSteps(input: unknown): Steps {
  return validate(stepsSchema, input)
}

export const workoutSchema = z.strictObject({
  id: entityId,
  date: calendarDate,
  kind: z.string().trim().min(1, 'Укажите вид тренировки').max(80, 'Название слишком длинное'),
  minutes: z.number().positive('Длительность должна быть больше нуля').max(1440, 'Технический предел: 1440 минут'),
  kcal: z.number().min(0, 'Оценка расхода не может быть отрицательной').max(100000, 'Технический предел: 100 000 ккал').nullable(),
  source: z.string().trim().max(160, 'Источник слишком длинный'),
  note: z.string().trim().max(500, 'Комментарий слишком длинный'),
})
export const workoutInputSchema = workoutSchema.omit({ id: true })
export type Workout = z.infer<typeof workoutSchema>

export function readWorkout(input: unknown): Workout {
  return validate(workoutSchema, input)
}

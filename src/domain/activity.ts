import { z } from 'zod'
import { calendarDate, validate } from './schema'

export const stepsSchema = z.strictObject({
  date: calendarDate,
  count: z.number({ error: 'Введите шаги числом' }).int('Введите целое число шагов').min(0, 'Шаги не могут быть отрицательными').max(1000000, 'Технический предел: 1 000 000 шагов'),
})
export type Steps = z.infer<typeof stepsSchema>

export function readSteps(input: unknown): Steps {
  return validate(stepsSchema, input)
}

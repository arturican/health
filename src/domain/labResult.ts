import { z } from 'zod'
import { calendarDate, entityId, validate } from './schema'
import { localDate } from './input'

export const labOperators = { eq: '', lt: '<', lte: '≤', gt: '>', gte: '≥' } as const
export const labOperatorSchema = z.enum(['eq', 'lt', 'lte', 'gt', 'gte'])
export const labValueSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('number'), number: z.number(), operator: labOperatorSchema }),
  z.strictObject({ type: z.literal('text'), text: z.string().trim().min(1, 'Введите текст результата').max(120, 'Результат слишком длинный') }),
])
export const labInputSchema = z.strictObject({
  documentId: entityId, date: calendarDate,
  name: z.string().trim().min(1, 'Введите название показателя').max(120, 'Название слишком длинное'),
  value: labValueSchema,
  unit: z.string().trim().max(40, 'Единицы слишком длинные'),
  reference: z.string().trim().max(160, 'Референс слишком длинный'),
  note: z.string().trim().max(500, 'Заметка слишком длинная'),
})
export const labResultSchema = labInputSchema.extend({ id: entityId })
export type LabResult = z.infer<typeof labResultSchema>
export function readLabInput(input: unknown) {
  const values = validate(labInputSchema, input)
  if (values.date > localDate()) throw new Error('Дата показателя не может быть в будущем')
  return values
}
export function readLabResult(input: unknown): LabResult {
  const result = validate(labResultSchema, input)
  if (result.date > localDate()) throw new Error('Дата показателя не может быть в будущем')
  return result
}
export function formatLabValue(input: unknown): string {
  const value = validate(labValueSchema, input)
  if (value.type === 'text') return value.text
  return `${labOperators[value.operator]} ${value.number.toLocaleString('ru-RU', { useGrouping: false, maximumSignificantDigits: 21 })}`.trim()
}

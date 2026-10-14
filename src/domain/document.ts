import { z } from 'zod'
import { calendarDate, entityId, validate } from './schema'
import { localDate } from './input'

export const documentKinds = { lab: 'Анализ', report: 'Выписка', imaging: 'Исследование', other: 'Другое' } as const
export const documentInputSchema = z.strictObject({
  date: calendarDate,
  title: z.string().trim().min(1, 'Введите название документа').max(160, 'Название слишком длинное'),
  kind: z.enum(['lab', 'report', 'imaging', 'other'], { error: 'Выберите категорию документа' }),
  note: z.string().trim().max(500, 'Заметка слишком длинная'),
})
export const documentSchema = documentInputSchema.extend({ id: entityId, fileId: entityId })
export type DiaryDocument = z.infer<typeof documentSchema>
export function readDocumentInput(input: unknown) {
  const values = validate(documentInputSchema, input)
  if (values.date > localDate()) throw new Error('Дата документа не может быть в будущем')
  return values
}
export function readDocument(input: unknown): DiaryDocument {
  const document = validate(documentSchema, input)
  if (document.date > localDate()) throw new Error('Дата документа не может быть в будущем')
  return document
}

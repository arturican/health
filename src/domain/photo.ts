import { z } from 'zod'
import { calendarDate, entityId, validate } from './schema'
import { localDate } from './input'
import { PHOTO_MAX_SIDE } from './imageGeometry'

export const photoInputSchema = z.strictObject({
  date: calendarDate,
  title: z.string().trim().min(1, 'Введите подпись фото').max(120, 'Подпись слишком длинная'),
  note: z.string().trim().max(500, 'Заметка слишком длинная'),
})
export const photoSchema = photoInputSchema.extend({
  id: entityId, fileId: entityId,
  width: z.number().int().min(1).max(PHOTO_MAX_SIDE),
  height: z.number().int().min(1).max(PHOTO_MAX_SIDE),
})
export type Photo = z.infer<typeof photoSchema>
export function readPhotoInput(input: unknown) {
  const values = validate(photoInputSchema, input)
  if (values.date > localDate()) throw new Error('Дата фото не может быть в будущем')
  return values
}
export function readPhoto(input: unknown): Photo {
  const photo = validate(photoSchema, input)
  if (photo.date > localDate()) throw new Error('Дата фото не может быть в будущем')
  return photo
}

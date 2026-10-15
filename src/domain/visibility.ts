import { z } from 'zod'
import { validate } from './schema'

export const VISIBILITY_SETTING_ID = 'section-visibility'
export const visibilitySchema = z.strictObject({ version: z.literal(1), showPhotos: z.boolean(), showDocuments: z.boolean() })
export type Visibility = z.infer<typeof visibilitySchema>
export const DEFAULT_VISIBILITY: Readonly<Visibility> = Object.freeze({ version: 1, showPhotos: true, showDocuments: true })

export function readVisibility(input: unknown): Visibility { return validate(visibilitySchema, input) }

export function readVisibilityValue(input: unknown): Visibility {
  let parsed: unknown
  try {
    if (typeof input !== 'string' || input.length > 20480) throw new Error('Ожидается ограниченный JSON')
    parsed = JSON.parse(input)
  } catch { throw new Error('Некорректные настройки видимости') }
  return readVisibility(parsed)
}

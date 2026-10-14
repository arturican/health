import { z } from 'zod'
import { profileSchema, weightSchema } from './profile'
import { foodEntrySchema, nutritionDaySchema, productSchema } from './nutrition'
import { validate } from './schema'

export const TEXT_BACKUP_MAX_BYTES = 20 * 1024 * 1024
export const BACKUP_MAX_RECORDS = 100000
export const textBackupSchema = z.strictObject({
  format: z.literal('health-diary-text'),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  profile: profileSchema.nullable(),
  weights: z.array(weightSchema).max(BACKUP_MAX_RECORDS),
  products: z.array(productSchema).max(BACKUP_MAX_RECORDS),
  foodEntries: z.array(foodEntrySchema).max(BACKUP_MAX_RECORDS),
  nutritionDays: z.array(nutritionDaySchema).max(BACKUP_MAX_RECORDS),
})
export type TextBackup = z.infer<typeof textBackupSchema>

export function serializeTextBackup(input: unknown): string {
  const backup = validate(textBackupSchema, input)
  const text = JSON.stringify(backup, null, 2)
  if (new TextEncoder().encode(text).byteLength > TEXT_BACKUP_MAX_BYTES) throw new Error('Текстовая копия превышает 20 MiB')
  return text
}

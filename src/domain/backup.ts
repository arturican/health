import { z } from 'zod'
import { profileSchema, weightSchema } from './profile'
import { foodEntrySchema, nutritionDaySchema, productSchema } from './nutrition'
import { validate } from './schema'
import { localDate } from './input'

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

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Повторяющиеся ${label}`)
}

export function readTextBackup(input: unknown): TextBackup {
  const backup = validate(textBackupSchema, input)
  for (const records of [backup.weights, backup.products, backup.foodEntries]) unique(records.map(record => record.id), 'идентификаторы')
  unique(backup.weights.map(record => record.date), 'даты веса')
  unique(backup.nutritionDays.map(record => record.date), 'даты полноты питания')
  const today = localDate()
  for (const record of [...backup.weights, ...backup.foodEntries, ...backup.nutritionDays]) {
    if (record.date > today) throw new Error('Записи дневника не могут быть в будущем')
  }
  if (backup.weights.length && !backup.profile) throw new Error('Для истории веса нужен профиль')
  const birthDate = backup.profile?.birthDate
  if (birthDate && backup.weights.some(weight => weight.date < birthDate)) throw new Error('Вес не может быть записан до даты рождения')
  const products = new Set(backup.products.map(product => product.id))
  if (backup.foodEntries.some(entry => entry.productId !== null && !products.has(entry.productId))) throw new Error('Запись еды ссылается на отсутствующий продукт')
  return backup
}

export function serializeTextBackup(input: unknown): string {
  const backup = readTextBackup(input)
  const text = JSON.stringify(backup, null, 2)
  if (new TextEncoder().encode(text).byteLength > TEXT_BACKUP_MAX_BYTES) throw new Error('Текстовая копия превышает 20 MiB')
  return text
}

import { z } from 'zod'
import { calendarDate, entityId, validate } from './schema'

const macro = z.number().nonnegative('Значение не может быть отрицательным').max(100, 'Проверьте значение на 100 г').nullable()
export const nutrientsSchema = z.strictObject({
  kcal: z.number().nonnegative('Калории не могут быть отрицательными').max(10000, 'Проверьте калории на 100 г'),
  protein: macro,
  fat: macro,
  carbs: macro,
})
export const snapshotSchema = nutrientsSchema.extend({
  name: z.string().trim().min(1, 'Введите название продукта').max(120, 'Название слишком длинное'),
  source: z.string().trim().max(160, 'Источник слишком длинный'),
})
export const productSchema = snapshotSchema.extend({ id: entityId, archived: z.boolean() })
export const gramsSchema = z.number().positive('Порция должна быть больше нуля').max(100000, 'Проверьте массу порции')
export const mealSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
export const mealNames = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' } as const
export const foodEntrySchema = z.strictObject({
  id: entityId,
  date: calendarDate,
  meal: mealSchema,
  productId: entityId.nullable(),
  snapshot: snapshotSchema,
  grams: gramsSchema,
  note: z.string().trim().max(500, 'Комментарий слишком длинный'),
})

export type Nutrients = z.infer<typeof nutrientsSchema>
export type ProductSnapshot = z.infer<typeof snapshotSchema>
export type Product = z.infer<typeof productSchema>
export type FoodEntry = z.infer<typeof foodEntrySchema>
export const nutritionDaySchema = z.strictObject({ date: calendarDate, complete: z.boolean() })
export type NutritionDay = z.infer<typeof nutritionDaySchema>
export type FoodTotals = { [Key in keyof Nutrients]: number | null }

export function readProduct(input: unknown): Product { return validate(productSchema, input) }
export function readFoodEntry(input: unknown): FoodEntry { return validate(foodEntrySchema, input) }

export function portion(input: unknown, gramsInput: unknown): Nutrients {
  const values = validate(snapshotSchema, input)
  const grams = validate(gramsSchema, gramsInput)
  const ratio = grams / 100
  return {
    kcal: values.kcal * ratio,
    protein: values.protein === null ? null : values.protein * ratio,
    fat: values.fat === null ? null : values.fat * ratio,
    carbs: values.carbs === null ? null : values.carbs * ratio,
  }
}

export function foodTotals(entries: readonly FoodEntry[], complete: boolean): FoodTotals {
  if (entries.length === 0 && !complete) return { kcal: null, protein: null, fat: null, carbs: null }
  const total: FoodTotals = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  for (const entry of entries) {
    const values = portion(entry.snapshot, entry.grams)
    total.kcal = (total.kcal ?? 0) + values.kcal
    for (const key of ['protein', 'fat', 'carbs'] as const) {
      const previous = total[key]
      const value = values[key]
      total[key] = previous === null || value === null ? null : previous + value
    }
  }
  return total
}

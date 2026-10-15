import { nutritionDaySchema, type NutritionDay } from '../domain/nutrition'
import { localDate, parseDate } from '../domain/input'
import { requestJSON } from './http'
import { mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(nutritionDaySchema)
export const getNutritionDay = (date = localDate()) => requestJSON(`/api/v1/nutrition-days/${parseDate(date)}`, schema.nullable())
export async function setNutritionDay(date: unknown, complete: unknown, original: NutritionDay | null) {
  const day = nutritionDaySchema.parse({ date, complete })
  if (original && original.date !== day.date) throw new Error('Дата исходной записи изменилась')
  const value = { value: day, revision: original ? recordRevision(original) : null }
  await mutateJSON('setNutritionDay', value, schema, () => ({ path: `/api/v1/nutrition-days/${day.date}`, method: 'PUT', value }))
}

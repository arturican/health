import type { ReadScope } from './readState'
import { z } from 'zod'
import { foodEntrySchema, mealSchema, type FoodEntry } from '../domain/nutrition'
import { calendarDate, entityId } from '../domain/schema'
import { localDate, parseDate } from '../domain/input'
import { readPages } from './pages'
import { deleteRecord, mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(foodEntrySchema)
const inputSchema = foodEntrySchema.pick({ date: true, meal: true, productId: true, grams: true, note: true }).extend({ productId: entityId })
const editSchema = foodEntrySchema.pick({ date: true, meal: true, grams: true, note: true })
export async function listFood(date = localDate(), scope?: ReadScope) {
  return (await readPages(`/api/v1/food?date=${parseDate(date)}`, schema, 'after', scope)).sort((a, b) => mealSchema.options.indexOf(a.meal) - mealSchema.options.indexOf(b.meal) || a.snapshot.name.localeCompare(b.snapshot.name, 'ru'))
}
export function addFood(input: unknown) {
  const value = inputSchema.parse(input)
  return mutateJSON('createFood', value, schema, id => ({ path: '/api/v1/food', method: 'POST', value: { value: { ...value, id }, revision: null } }))
}
export async function updateFood(original: FoodEntry, input: unknown) {
  const value = { value: { ...editSchema.parse(input), id: original.id }, revision: recordRevision(original) }
  await mutateJSON('updateFood', value, schema, () => ({ path: `/api/v1/food/${original.id}`, method: 'PUT', value }))
}
export const deleteFood = (original: FoodEntry) => deleteRecord(`/api/v1/food/${original.id}`, original)
export async function copyMeal(sourceInput: unknown, mealInput: unknown, targetInput: unknown) {
  const value = { source: calendarDate.parse(sourceInput), meal: mealSchema.parse(mealInput), target: calendarDate.parse(targetInput) }
  const result = await mutateJSON('copyMeal', value, z.object({ count: z.number().int().positive() }), commandId => ({ path: '/api/v1/food/copy', method: 'POST', value: { ...value, commandId } }))
  return result.count
}

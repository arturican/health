import { z } from 'zod'
import { profileSchema, weightSchema } from './profile'
import { validate } from './schema'

export const restingInputSchema = z.strictObject({
  kg: weightSchema.shape.kg.nullable(),
  heightCm: profileSchema.shape.heightCm.nullable(),
  age: z.number().int().min(0).max(9998).nullable(),
  formulaSex: profileSchema.shape.formulaSex,
})
export type RestingInput = z.infer<typeof restingInputSchema>

export function calculateRestingEnergy(input: unknown): number | null {
  const values = validate(restingInputSchema, input)
  if (values.kg === null || values.heightCm === null || values.age === null || values.formulaSex === 'none' || values.age < 19 || values.age > 78) return null
  const result = 10 * values.kg + 6.25 * values.heightCm - 5 * values.age + (values.formulaSex === 'male' ? 5 : -161)
  return Number.isFinite(result) && result > 0 ? result : null
}

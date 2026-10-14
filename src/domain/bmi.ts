import { profileSchema, weightSchema } from './profile'
import { validate } from './schema'

export const bmiCategories = {
  below: 'Менее 18,5',
  reference: 'От 18,5 до 25 (не включая 25)',
  above: 'От 25 до 30 (не включая 30)',
  high: '30 и выше',
} as const

export function calculateBmi(kg: number | null, heightCm: number | null): number | null {
  if (kg !== null) validate(weightSchema.shape.kg, kg)
  if (heightCm !== null) validate(profileSchema.shape.heightCm, heightCm)
  if (kg === null || heightCm === null) return null
  const result = kg / (heightCm / 100) ** 2
  if (!Number.isFinite(result) || result <= 0) throw new Error('Проверьте параметры для расчёта ИМТ')
  return result
}

export function adultBmiCategory(bmi: number | null, age: number | null): keyof typeof bmiCategories | null {
  if (bmi !== null && (!Number.isFinite(bmi) || bmi <= 0)) throw new Error('Некорректное значение ИМТ')
  if (age !== null && (!Number.isInteger(age) || age < 0)) throw new Error('Некорректный возраст')
  if (bmi === null || age === null || age < 20) return null
  if (bmi < 18.5) return 'below'
  if (bmi < 25) return 'reference'
  if (bmi < 30) return 'above'
  return 'high'
}

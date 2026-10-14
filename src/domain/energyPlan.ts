import { z } from 'zod'
import { calendarDate, entityId, validate } from './schema'
import { localDate } from './input'
import { restingInputSchema } from './restingEnergy'

const dailyKcal = z.number().min(0, 'Ккал не могут быть отрицательными').max(100000, 'Технический предел: 100 000 ккал')
export const energyPlanInputSchema = z.strictObject({
  effectiveFrom: calendarDate,
  goalKcal: dailyKcal.nullable(),
  method: z.enum(['none', 'manual', 'factor']),
  manualKcal: dailyKcal.nullable(),
  factor: z.number().positive('Коэффициент должен быть больше нуля').max(10, 'Технический предел коэффициента: 10').nullable(),
  source: z.string().trim().max(160, 'Источник слишком длинный'),
})
export const energyPlanSchema = energyPlanInputSchema.extend({
  id: entityId,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdOn: calendarDate,
  restingFormula: z.literal('mifflin-st-jeor-1990'),
  snapshot: restingInputSchema.extend({ weightDate: calendarDate.nullable() }),
})
export type EnergyPlanInput = z.infer<typeof energyPlanInputSchema>
export type EnergyPlan = z.infer<typeof energyPlanSchema>

function checkMethod(values: EnergyPlanInput) {
  const valid = values.method === 'none' ? values.manualKcal === null && values.factor === null
    : values.method === 'manual' ? values.manualKcal !== null && values.factor === null
      : values.manualKcal === null && values.factor !== null
  if (!valid) throw new Error('Заполните только параметры выбранного способа оценки расхода')
}

export function readEnergyPlanInput(input: unknown): EnergyPlanInput {
  const values = validate(energyPlanInputSchema, input)
  checkMethod(values)
  return values
}

export function readEnergyPlan(input: unknown): EnergyPlan {
  const plan = validate(energyPlanSchema, input)
  checkMethod(plan)
  if (plan.createdOn > localDate() || plan.effectiveFrom < plan.createdOn) throw new Error('Даты версии плана не согласованы')
  if ((plan.snapshot.kg === null) !== (plan.snapshot.weightDate === null) || (plan.snapshot.weightDate !== null && plan.snapshot.weightDate > plan.createdOn)) throw new Error('Дата и значение веса в снимке не согласованы')
  return plan
}

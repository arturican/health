import { z } from 'zod'
import { readEnergyPlan } from './energyPlan'
import { calculateRestingEnergy } from './restingEnergy'
import { validate } from './schema'

const calories = z.number().nonnegative().nullable()
const energyDaySchema = z.strictObject({
  goalKcal: calories,
  intakeKcal: calories,
  expenditureKcal: calories,
  complete: z.boolean(),
})

export function calculateExpenditure(input: unknown): number | null {
  const plan = readEnergyPlan(input)
  if (plan.method === 'none') return null
  if (plan.method === 'manual') return plan.manualKcal
  const { kg, heightCm, age, formulaSex } = plan.snapshot
  const resting = calculateRestingEnergy({ kg, heightCm, age, formulaSex })
  return resting === null || plan.factor === null ? null : resting * plan.factor
}

export function calculateEnergyDay(input: unknown): { goalRemaining: number | null; balance: number | null } {
  const { goalKcal, intakeKcal, expenditureKcal, complete } = validate(energyDaySchema, input)
  return {
    goalRemaining: goalKcal === null || intakeKcal === null ? null : goalKcal - intakeKcal,
    balance: !complete || expenditureKcal === null || intakeKcal === null ? null : expenditureKcal - intakeKcal,
  }
}

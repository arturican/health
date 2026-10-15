import { energyPlanSchema, readEnergyPlan, readEnergyPlanInput, type EnergyPlan } from '../domain/energyPlan'
import { calendarDate } from '../domain/schema'
import { localDate } from '../domain/input'
import { requestJSON } from './http'
import { readPages } from './pages'
import { mutateJSON } from './mutations'
import { recordRevision, recordSchema } from './records'

const schema = recordSchema(energyPlanSchema.transform(value => readEnergyPlan(value)))
export async function listEnergyPlans() {
  return (await readPages('/api/v1/energy-plans', schema, 'before')).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.revision - a.revision)
}
export const getEnergyPlan = (date: unknown = localDate()) => requestJSON(`/api/v1/energy-plans/effective/${calendarDate.parse(date)}`, schema.nullable())
export function addEnergyPlan(input: unknown, latest: EnergyPlan | null) {
  const value = { value: readEnergyPlanInput(input), expectedRevision: latest ? recordRevision(latest) : null }
  return mutateJSON('createEnergyPlan', value, schema, id => ({ path: '/api/v1/energy-plans', method: 'POST', value: { ...value, id } }))
}

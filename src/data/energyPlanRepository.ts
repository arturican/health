import { db, type DiaryDatabase } from './db'
import { readEnergyPlan, readEnergyPlanInput, type EnergyPlan } from '../domain/energyPlan'
import { ageOn, localDate } from '../domain/input'
import { calendarDate, validate } from '../domain/schema'
import { getProfile } from './profileRepository'
import { latestWeight } from './weightRepository'
import { assertRecordCapacity } from './recordLimit'

export async function listEnergyPlans(database: DiaryDatabase = db): Promise<EnergyPlan[]> {
  const values: unknown[] = await database.energyPlans.toArray()
  return values.map(value => readEnergyPlan(value)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.revision - a.revision)
}

export async function getEnergyPlan(date: unknown = localDate(), database: DiaryDatabase = db): Promise<EnergyPlan | null> {
  const day = validate(calendarDate, date)
  return (await listEnergyPlans(database)).find(plan => plan.effectiveFrom <= day) ?? null
}

export async function addEnergyPlan(input: unknown, database: DiaryDatabase = db): Promise<EnergyPlan> {
  const values = readEnergyPlanInput(input)
  const today = localDate()
  if (values.effectiveFrom < today) throw new Error('Новая версия действует с сегодняшнего или будущего дня')
  return database.transaction('rw', [database.energyPlans, database.profiles, database.weights], async () => {
    assertRecordCapacity(await database.energyPlans.count())
    const profile = await getProfile(database)
    const weight = await latestWeight(today, database)
    const plans = await listEnergyPlans(database)
    const revision = plans.reduce((maximum, plan) => Math.max(maximum, plan.revision), 0) + 1
    const plan = readEnergyPlan({
      ...values, id: crypto.randomUUID(), revision, createdOn: today, restingFormula: 'mifflin-st-jeor-1990',
      snapshot: {
        kg: weight?.kg ?? null, weightDate: weight?.date ?? null,
        heightCm: profile?.heightCm ?? null,
        age: profile?.birthDate ? ageOn(profile.birthDate, today) : null,
        formulaSex: profile?.formulaSex ?? 'none',
      },
    })
    await database.energyPlans.add(plan)
    return plan
  })
}

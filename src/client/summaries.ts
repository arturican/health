import { consistentRead } from './readState'
import { getProfile } from './profileRepository'
import { listWeights } from './weightRepository'
import { listFood } from './foodRepository'
import { getNutritionDay } from './nutritionRepository'
import { getSteps, listSteps } from './stepsRepository'
import { listWorkouts } from './workoutRepository'
import { getEnergyPlan } from './energyPlanRepository'
import { activityDates, activityOverview } from '../domain/activityOverview'

export const getWeightOverview = (day: string) => consistentRead(async scope => ({ day, profile: await getProfile(), weights: await listWeights(day, scope) }))
export const getNutritionSummary = (day: string) => consistentRead(async scope => ({ day, entries: await listFood(day, scope), status: await getNutritionDay(day) }))
export const getActivitySummary = (day: string) => consistentRead(async scope => ({ day, steps: await getSteps(day), workouts: await listWorkouts(day, scope) }))
export const getEnergySummary = (day: string) => consistentRead(async scope => ({ day, plan: await getEnergyPlan(day), entries: await listFood(day, scope), status: await getNutritionDay(day) }))
export const getActivityOverview = (day: string) => consistentRead(async scope => {
  const dates = activityDates(day)
  return { day, value: activityOverview(day, await listSteps(dates[0] ?? day, day, scope), await listWorkouts(day, scope)) }
})

export const getTodaySummary = (day: string) => consistentRead(async scope => ({
  day, profile: await getProfile(), weights: await listWeights(day, scope),
  entries: await listFood(day, scope), status: await getNutritionDay(day), plan: await getEnergyPlan(day),
  steps: await getSteps(day), workouts: await listWorkouts(day, scope),
}))

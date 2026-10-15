import { consistentRead } from './readState'
import { getProfile } from './profileRepository'
import { listWeights } from './weightRepository'
import { listFood } from './foodRepository'
import { getNutritionDay } from './nutritionRepository'
import { getSteps, listSteps } from './stepsRepository'
import { listWorkouts } from './workoutRepository'
import { getEnergyPlan } from './energyPlanRepository'
import { activityDates, activityOverview } from '../domain/activityOverview'

export const getWeightOverview = (day: string) => consistentRead(async () => ({ day, profile: await getProfile(), weights: await listWeights(day) }))
export const getNutritionSummary = (day: string) => consistentRead(async () => ({ day, entries: await listFood(day), status: await getNutritionDay(day) }))
export const getActivitySummary = (day: string) => consistentRead(async () => ({ day, steps: await getSteps(day), workouts: await listWorkouts(day) }))
export const getEnergySummary = (day: string) => consistentRead(async () => ({ day, plan: await getEnergyPlan(day), entries: await listFood(day), status: await getNutritionDay(day) }))
export const getActivityOverview = (day: string) => consistentRead(async () => {
  const dates = activityDates(day)
  return { day, value: activityOverview(day, await listSteps(dates[0] ?? day, day), await listWorkouts(day)) }
})

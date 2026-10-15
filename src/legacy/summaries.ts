import { db } from '../data/db'
import { getProfile } from '../data/profileRepository'
import { listWeights } from '../data/weightRepository'
import { listFood } from '../data/foodRepository'
import { getNutritionDay } from '../data/nutritionRepository'
import { getSteps } from '../data/stepsRepository'
import { listWorkouts } from '../data/workoutRepository'
import { getEnergyPlan } from '../data/energyPlanRepository'
import { activityDates, activityOverview } from '../domain/activityOverview'

export const getWeightOverview = (day: string) => db.transaction('r', db.profiles, db.weights,
  async () => ({ day, profile: await getProfile(), weights: await listWeights(day) }))
export const getNutritionSummary = (day: string) => db.transaction('r', db.foodEntries, db.nutritionDays,
  async () => ({ day, entries: await listFood(day), status: await getNutritionDay(day) }))
export const getActivitySummary = (day: string) => db.transaction('r', db.steps, db.workouts,
  async () => ({ day, steps: await getSteps(day), workouts: await listWorkouts(day) }))
export const getEnergySummary = (day: string) => db.transaction('r', [db.energyPlans, db.foodEntries, db.nutritionDays],
  async () => ({ day, plan: await getEnergyPlan(day), entries: await listFood(day), status: await getNutritionDay(day) }))
export const getActivityOverview = (day: string) => db.transaction('r', db.steps, db.workouts, async () => {
  const dates = activityDates(day)
  return { day, value: activityOverview(day, await db.steps.where('date').between(dates[0] ?? day, day, true, true).toArray(), await listWorkouts(day)) }
})

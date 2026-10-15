// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { clientApi } from '../../tests/clientApi'
import { registerProfile } from '../server/profileRoutes'
import { registerWeights } from '../server/weightRoutes'
import { registerFood } from '../server/foodRoutes'
import { registerNutrition } from '../server/nutritionRoutes'
import { registerSteps } from '../server/stepsRoutes'
import { registerWorkouts } from '../server/workoutRoutes'
import { registerPlans } from '../server/planRoutes'
import { createProfile } from './profileRepository'
import { saveSteps } from './stepsRepository'
import { addWorkout } from './workoutRepository'
import { getActivityOverview, getActivitySummary, getEnergySummary, getNutritionSummary, getWeightOverview } from './summaries'

it('сводки читают выбранный день и сохраняют различие пропуска и нуля', async () => {
  const api = await clientApi((...args) => {
    registerProfile(...args); registerWeights(...args); registerFood(...args); registerNutrition(...args)
    registerSteps(...args); registerWorkouts(...args); registerPlans(...args)
  })
  try {
    const day = '2026-10-15'
    expect(await getWeightOverview(day)).toEqual({ day, profile: null, weights: [] })
    expect(await getNutritionSummary(day)).toEqual({ day, entries: [], status: null })
    expect(await getEnergySummary(day)).toEqual({ day, plan: null, entries: [], status: null })
    await createProfile({ id: 'self', name: 'Учебный профиль', heightCm: 178, birthDate: null, formulaSex: 'none' }, { id: randomUUID(), date: day, kg: 75 })
    expect((await getWeightOverview('2026-10-14')).weights).toEqual([])
    expect((await getWeightOverview(day)).weights).toHaveLength(1)
    await saveSteps({ date: day, count: 0 }, null)
    await addWorkout({ date: day, kind: 'Прогулка', minutes: 20, kcal: null, source: '', note: '' })
    expect(await getActivitySummary(day)).toMatchObject({ day, steps: { count: 0 }, workouts: [{ minutes: 20, kcal: null }] })
    const overview = (await getActivityOverview(day)).value
    expect(overview).toMatchObject({ steps: 0, count: 1, minutes: 20 })
    expect(overview.days.slice(0, 6).every(entry => entry.count === null)).toBe(true)
  } finally { await api.close() }
})

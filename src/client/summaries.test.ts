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
import { getTodaySummary, getActivityOverview, getActivitySummary, getEnergySummary, getNutritionSummary, getWeightOverview } from './summaries'

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

it('каждая сводка использует одну пару state GET даже при вложенном paged read', async () => {
  const api = await clientApi((...args) => {
    registerProfile(...args); registerWeights(...args); registerFood(...args); registerNutrition(...args)
    registerSteps(...args); registerWorkouts(...args); registerPlans(...args)
  })
  try {
    for (const read of [getWeightOverview, getNutritionSummary, getEnergySummary, getActivitySummary, getActivityOverview]) {
      api.network.mockClear()
      await read('2026-10-15')
      expect(api.network.mock.calls.filter(([path]) => path === '/api/v1/diary-state')).toHaveLength(2)
    }
  } finally { await api.close() }
})

it('снимок Today читает ресурсы один раз и сохраняет zero/null выбранного дня', async () => {
  const api = await clientApi((...args) => {
    registerProfile(...args); registerWeights(...args); registerFood(...args); registerNutrition(...args)
    registerSteps(...args); registerWorkouts(...args); registerPlans(...args)
  })
  try {
    await saveSteps({ date: '2026-10-15', count: 0 }, null)
    api.network.mockClear()
    expect(await getTodaySummary('2026-10-15')).toMatchObject({ day: '2026-10-15', profile: null, weights: [], entries: [], status: null, plan: null, steps: { count: 0 }, workouts: [] })
    const paths = api.network.mock.calls.map(([path]) => typeof path === 'string' ? path.split('?')[0] : '')
    expect(paths).toHaveLength(9)
    expect(paths.filter(path => path === '/api/v1/diary-state')).toHaveLength(2)
    for (const path of ['/api/v1/profile','/api/v1/weights','/api/v1/food','/api/v1/nutrition-days/2026-10-15','/api/v1/energy-plans/effective/2026-10-15','/api/v1/steps/2026-10-15','/api/v1/workouts']) expect(paths.filter(value => value === path)).toHaveLength(1)
    expect((await getTodaySummary('2026-10-14')).steps).toBeNull()
  } finally { await api.close() }
})

it('смена revision между ресурсами Today повторяет весь snapshot', async () => {
  const api = await clientApi((...args) => {
    registerProfile(...args); registerWeights(...args); registerFood(...args); registerNutrition(...args)
    registerSteps(...args); registerWorkouts(...args); registerPlans(...args)
  })
  try {
    const transport = api.network.getMockImplementation()
    if (!transport) throw new Error('No transport')
    let changed = false
    api.network.mockImplementation(async (...args) => {
      const response = await transport(...args)
      if (typeof args[0] === 'string' && args[0].startsWith('/api/v1/food?') && !changed) {
        changed = true
        await saveSteps({ date: '2026-10-15', count: 0 }, null)
      }
      return response
    })
    expect((await getTodaySummary('2026-10-15')).steps).toMatchObject({ count: 0 })
    expect(api.network.mock.calls.filter(([path]) => typeof path === 'string' && path.startsWith('/api/v1/food?'))).toHaveLength(2)
  } finally { await api.close() }
})

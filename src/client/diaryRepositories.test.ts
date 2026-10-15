// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { clientApi } from '../../tests/clientApi'
import { registerProducts } from '../server/productRoutes'
import { registerFood } from '../server/foodRoutes'
import { registerNutrition } from '../server/nutritionRoutes'
import { registerSteps } from '../server/stepsRoutes'
import { registerWorkouts } from '../server/workoutRoutes'
import { registerPlans } from '../server/planRoutes'
import { addFood, copyMeal, deleteFood, listFood, updateFood } from './foodRepository'
import { getNutritionDay, setNutritionDay } from './nutritionRepository'
import { deleteSteps, getSteps, listSteps, saveSteps } from './stepsRepository'
import { addWorkout, deleteWorkout, listWorkouts, updateWorkout } from './workoutRepository'
import { addEnergyPlan, getEnergyPlan, listEnergyPlans } from './energyPlanRepository'
import { listProducts, seedProducts, updateProduct } from './productRepository'

let api: Awaited<ReturnType<typeof clientApi>>
const day = '2026-10-15'
beforeEach(async () => {
  api = await clientApi((app, pool, authorize, clock) => {
    registerProducts(app, pool, authorize)
    registerFood(app, pool, authorize, clock); registerNutrition(app, pool, authorize, clock)
    registerSteps(app, pool, authorize, clock); registerWorkouts(app, pool, authorize, clock); registerPlans(app, pool, authorize, clock)
  })
})
afterEach(async () => { await api.close() })

it('еда хранит снимок, копируется без дублей при потере ответа, правится и удаляется', async () => {
  expect(await listFood(day)).toEqual([])
  await seedProducts()
  const product = (await listProducts())[0]
  if (!product) throw new Error('Нет продукта')
  const input = { date: day, meal: 'breakfast', productId: product.id, grams: 125, note: '' }
  const entry = await addFood(input)
  await updateProduct(product, { name: 'Другое имя', source: '', kcal: 999, protein: null, fat: null, carbs: null })
  expect((await listFood(day))[0]?.snapshot).toEqual(entry.snapshot)
  const transport = api.network.getMockImplementation()
  if (!transport) throw new Error('Нет транспорта')
  api.network.mockImplementationOnce(async (...args) => { await transport(...args); throw new Error('Ответ потерян') })
  await expect(copyMeal(day, 'breakfast', '2026-10-14')).rejects.toThrow()
  expect(await copyMeal(day, 'breakfast', '2026-10-14')).toBe(1)
  expect(await listFood('2026-10-14')).toHaveLength(1)
  await updateFood(entry, { date: day, meal: 'breakfast', grams: 50, note: 'Правка' })
  await expect(deleteFood(entry)).rejects.toMatchObject({ status: 409 })
  const current = (await listFood(day))[0]
  if (!current) throw new Error('Нет еды')
  await deleteFood(current)
  expect(await listFood(day)).toEqual([])
  await api.signIn('bob')
  expect(await listFood('2026-10-14')).toEqual([])
})

it('полнота дня и шаги различают пустоту, ноль и конфликт исходной версии', async () => {
  expect(await getNutritionDay(day)).toBeNull()
  expect(await getSteps(day)).toBeNull()
  await setNutritionDay(day, true, null)
  await expect(setNutritionDay(day, false, null)).rejects.toMatchObject({ status: 409 })
  const nutrition = await getNutritionDay(day)
  await setNutritionDay(day, false, nutrition)
  expect(await getNutritionDay(day)).toEqual({ date: day, complete: false })
  await saveSteps({ date: day, count: 0 }, null)
  const steps = await getSteps(day)
  if (!steps) throw new Error('Нет шагов')
  expect(steps.count).toBe(0)
  await saveSteps({ date: day, count: 5000 }, steps)
  await expect(deleteSteps(steps)).rejects.toMatchObject({ status: 409 })
  const current = (await listSteps('2026-10-09', day))[0]
  if (!current) throw new Error('Нет списка шагов')
  await deleteSteps(current)
  expect(await listSteps('2026-10-09', day)).toEqual([])
  await expect(saveSteps({ date: day, count: -1 }, null)).rejects.toThrow()
})

it('тренировка сохраняет неизвестный расход, правку и удаление', async () => {
  const input = { date: day, kind: 'Прогулка', minutes: 40, kcal: null, source: '', note: '' }
  const original = await addWorkout(input)
  expect(original.kcal).toBeNull()
  await updateWorkout(original, { ...input, minutes: 45 })
  await expect(deleteWorkout(original)).rejects.toMatchObject({ status: 409 })
  const current = (await listWorkouts(day))[0]
  if (!current) throw new Error('Нет тренировки')
  expect(current.minutes).toBe(45)
  await deleteWorkout(current)
  expect(await listWorkouts(day)).toEqual([])
})

it('план создаёт серверный снимок и сохраняет предыдущие версии', async () => {
  expect(await getEnergyPlan(day)).toBeNull()
  const input = { effectiveFrom: day, goalKcal: 2000, method: 'none', manualKcal: null, factor: null, source: 'Учебная цель' }
  const original = await addEnergyPlan(input, null)
  expect(original).toMatchObject({ revision: 1, createdOn: day, snapshot: { kg: null, heightCm: null } })
  await expect(addEnergyPlan({ ...input, goalKcal: 2100 }, null)).rejects.toMatchObject({ status: 409 })
  const next = await addEnergyPlan({ ...input, method: 'manual', manualKcal: 2300 }, original)
  expect(next.revision).toBe(2)
  expect(await getEnergyPlan(day)).toEqual(next)
  expect(await listEnergyPlans()).toEqual([next, original])
  await api.signIn('bob')
  expect(await listEnergyPlans()).toEqual([])
})

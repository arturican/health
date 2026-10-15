import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { registerAuthentication } from './auth.js'
import { inputValue } from './httpErrors.js'
import { diaryDate } from './recordValidation.js'
import { withUser } from './userTransaction.js'
import { copyMealRecords, getNutritionRecord, saveNutritionRecord } from './nutritionRecords.js'

const routeDate = (params: unknown) => inputValue(() => z.object({ date: z.string() }).parse(params).date)

export function registerNutrition(app: FastifyInstance, pool: Pool, authorize: Awaited<ReturnType<typeof registerAuthentication>>, clock = () => new Date()) {
  app.get('/api/v1/nutrition-days/:date', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => getNutritionRecord(client, routeDate(request.params)))
  })
  app.put('/api/v1/nutrition-days/:date', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => saveNutritionRecord(client, account.id, routeDate(request.params), request.body, diaryDate(account.timezone, clock())), true)
  })
  app.post('/api/v1/food/copy', async (request, reply) => {
    const account = await authorize(request, reply)
    if (!account) return
    return withUser(pool, account, client => copyMealRecords(client, account.id, request.body, diaryDate(account.timezone, clock())), true)
  })
}

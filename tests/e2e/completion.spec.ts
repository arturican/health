import { z } from 'zod'
import { sessionSchema } from '../../src/domain/session'
import { verifyWorkoutSmoke } from '../workoutSmoke'
import { expect, test } from './fixtures'

test('приёмка исправлений: ожидающая тренировка, новая страница, CRUD и неверный текст API', async ({ page, context, baseURL }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (new URL(request.url()).origin !== baseURL) external.push(request.url()) })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  const rawSession: unknown = await (await context.request.get('/api/v1/auth/session')).json()
  const rawState: unknown = await (await context.request.get('/api/v1/diary-state')).json()
  const session = sessionSchema.parse(rawSession)
  const state = z.object({ generation: z.uuid() }).parse(rawState)
  await page.goto('/#today')
  await verifyWorkoutSmoke(page, context, { Origin: baseURL ?? '', 'X-CSRF-Token': session.csrf, 'X-Diary-Generation': state.generation })
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

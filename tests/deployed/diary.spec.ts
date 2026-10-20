import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { z } from 'zod'
import axe from 'axe-core'
import { weightSchema } from '../../src/domain/profile'
import { sessionSchema } from '../../src/domain/session'
import { verifyWorkoutSmoke } from '../workoutSmoke'

const weightsSchema = z.object({ items: z.array(z.object({ value: weightSchema, revision: z.number() })) })
const attachmentsSchema = z.object({ items: z.array(z.object({ value: z.object({ fileId: z.uuid() }) })) })
test.use({ timezoneId: 'Europe/Moscow' })

test('HTTPS дневник: вход, восемь экранов, вложения, CRUD и выход', async ({ page, context, baseURL }, info) => {
  test.setTimeout(120_000)
  const credentialPath = process.env['HEALTH_DEMO_CREDENTIALS']
  if (!credentialPath) throw new Error('Set HEALTH_DEMO_CREDENTIALS to a private synthetic demo credential file')
  const raw: unknown = JSON.parse(await readFile(credentialPath, 'utf8'))
  const credentials = z.strictObject({ login: z.literal('health-demo'), password: z.string().min(15) }).parse(raw)
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('request', request => { if (new URL(request.url()).origin !== baseURL) external.push(request.url()) })
  await page.goto('/#profile')
  await expect(page.getByRole('heading', { name: 'Вход в дневник' })).toBeVisible()
  await page.getByLabel('Почта', { exact: true }).fill(credentials.login)
  await page.getByLabel('Пароль', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByText('Илья Ветров — демо', { exact: true })).toBeVisible()
  // Start console assertions after the expected unauthenticated session probe.
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const cookie = (await context.cookies()).find(value => value.name === '__Host-health_session')
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' })
  const rawSession: unknown = await (await context.request.get('/api/v1/auth/session')).json()
  const session = sessionSchema.parse(rawSession)
  const rawDiary: unknown = await (await context.request.get('/api/v1/diary-state')).json()
  const diary = z.object({ generation: z.uuid() }).parse(rawDiary)
  const headers = { Origin: baseURL ?? '', 'X-CSRF-Token': session.csrf, 'X-Diary-Generation': diary.generation }
  const readWeights = async () => {
    const response = await context.request.get('/api/v1/weights')
    expect(response.status()).toBe(200)
    const raw: unknown = await response.json()
    return weightsSchema.parse(raw).items
  }
  const original = await readWeights()
  expect(original).toHaveLength(31)
  const today = original[0]?.value.date
  if (!today) throw new Error('Missing synthetic observation date')
  await page.clock.setFixedTime(new Date(today + 'T12:00:00Z'))
  await page.evaluate(axe.source)
  for (const [route, title] of [
    ['today', 'Сегодня'], ['profile', 'Профиль'], ['weight', 'Вес'], ['nutrition', 'Питание'],
    ['activity', 'Активность'], ['photos', 'Фото'], ['documents', 'Документы'], ['settings', 'Настройки'],
  ]) {
    if (!route || !title) throw new Error('Invalid test route')
    await page.getByRole('navigation', { name: 'Разделы дневника', exact: true }).getByRole('link', { name: title, exact: true }).click()
    await expect(page).toHaveURL(new RegExp('#' + route + '$'))
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: /^Загружаем/ })).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    if (route === 'weight') await expect(page.getByRole('img', { name: 'График веса', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(async () => (await window.axe.run(document)).violations)).toEqual([])
  }
  for (const [route, mime, prefix] of [['documents', 'application/pdf', '%PDF-'], ['photos', 'image/jpeg', '']]) {
    const raw: unknown = await (await context.request.get('/api/v1/' + String(route))).json()
    const records = attachmentsSchema.parse(raw).items
    expect(records).toHaveLength(3)
    for (const record of records) {
      const file = await context.request.get('/api/v1/files/' + record.value.fileId)
      expect(file.status()).toBe(200)
      expect(file.headers()['content-type']).toContain(mime)
      const bytes = await file.body()
      expect(bytes.length).toBeGreaterThan(100)
      if (prefix) expect(bytes.subarray(0, 5).toString()).toBe(prefix)
      else expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255])
    }
  }
  const date = '2020-01-02'
  expect(original.some(record => record.value.date === date)).toBe(false)
  let createdId: string | undefined
  try {
    await page.getByRole('link', { name: 'Вес', exact: true }).click()
    await page.getByLabel('Дата измерения', { exact: true }).fill(date)
    await page.getByLabel('Вес, кг', { exact: true }).fill('83,4')
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/weights' && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click()
    const rawSaved: unknown = await (await saved).json()
    createdId = z.object({ value: weightSchema }).parse(rawSaved).value.id
    const edit = page.getByRole('button', { name: 'Изменить вес за 02.01.2020', exact: true })
    await expect(edit).toBeVisible()
    await page.reload()
    await expect(edit).toBeVisible()
    await edit.click()
    await page.getByLabel('Вес, кг', { exact: true }).fill('83,5')
    await page.getByRole('button', { name: 'Сохранить вес', exact: true }).click()
    await expect(page.getByRole('list', { name: 'История веса', exact: true }).getByRole('listitem').filter({ has: edit })).toContainText('83,5 кг')
    expect((await readWeights()).find(row => row.value.id === createdId)?.value.kg).toBe(83.5)
    await page.getByRole('button', { name: 'Удалить вес за 02.01.2020', exact: true }).click()
    await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
    await expect(edit).toHaveCount(0)
  } finally {
    const remaining = (await readWeights()).find(row => row.value.id === createdId)
    if (remaining) {
      const removed = await context.request.delete('/api/v1/weights/' + remaining.value.id,
        { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { revision: remaining.revision } })
      expect(removed.status()).toBe(204)
    }
  }
  expect(await readWeights()).toEqual(original)
  await verifyWorkoutSmoke(page, context, headers)
  await page.getByLabel('День дневника', { exact: true }).fill(today)
  await page.getByRole('button', { name: 'Открыть день', exact: true }).click()
  const denied = await context.request.post('/api/v1/weights', { headers: { Origin: baseURL ?? '' }, data: {} })
  expect(denied.status()).toBe(403)
  await page.getByRole('link', { name: 'Сегодня', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Сегодня', exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: /^Загружаем/ })).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'График веса', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('synthetic-live-diary.png'), fullPage: true })
  expect(errors).toEqual([])
  expect(external).toEqual([])
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вход в дневник' })).toBeVisible()
  expect((await context.request.get('/api/v1/profile')).status()).toBe(401)
})

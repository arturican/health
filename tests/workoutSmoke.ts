import { randomUUID } from 'node:crypto'
import { expect, type BrowserContext, type Page } from '@playwright/test'
import { z } from 'zod'
import { workoutSchema } from '../src/domain/activity'

const records = z.object({ items: z.array(z.object({ value: workoutSchema, revision: z.number() })) })
const date = '2020-01-02'

export async function verifyWorkoutSmoke(page: Page, context: BrowserContext, headers: Record<string, string>) {
  const read = async () => {
    const response = await context.request.get('/api/v1/workouts?date=' + date)
    expect(response.status()).toBe(200)
    const raw: unknown = await response.json()
    return records.parse(raw).items
  }
  const original = await read()
  const tag = 'Синтетическая приёмка ' + randomUUID()
  const first = tag + ' А', second = tag + ' Б'
  const openDay = async (target: Page) => {
    await target.getByLabel('День дневника', { exact: true }).fill(date)
    await target.getByRole('button', { name: 'Открыть день', exact: true }).click()
  }
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  await openDay(page)
  const form = page.getByRole('form', { name: 'Добавление тренировки' })
  const editFirst = page.getByRole('button', { name: new RegExp('^Изменить тренировку [0-9]+: ' + first + '$') })
  try {
    await form.getByLabel('Вид тренировки', { exact: true }).fill(first)
    await form.getByLabel('Длительность, мин', { exact: true }).fill('15')
    await form.getByRole('button', { name: 'Добавить тренировку', exact: true }).click()
    await expect(editFirst).toBeVisible()
    let release = () => {}, entered = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    const path = '**/api/v1/workouts'
    await page.route(path, async route => {
      if (route.request().method() === 'POST') { entered(); await held }
      await route.continue()
    })
    await form.getByLabel('Вид тренировки', { exact: true }).fill(second)
    await form.getByLabel('Длительность, мин', { exact: true }).fill('17,5')
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/workouts' && response.request().method() === 'POST')
    try {
      await form.getByRole('button', { name: 'Добавить тренировку', exact: true }).click()
      await started
      await expect(editFirst).toBeDisabled()
      await expect(form.getByLabel('Вид тренировки', { exact: true })).toBeDisabled()
    } finally { release(); await saved; await page.unroute(path) }
    await expect(page.getByText(second, { exact: true })).toBeVisible()
    const reopened = await context.newPage()
    const errors: string[] = []
    reopened.on('pageerror', error => errors.push(error.message))
    reopened.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    try {
      await reopened.goto('/#activity')
      await openDay(reopened)
      await expect(reopened.getByText(second, { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally { await reopened.close() }
    await page.getByRole('button', { name: new RegExp('^Изменить тренировку [0-9]+: ' + second + '$') }).click()
    const editor = page.getByRole('form', { name: 'Редактирование тренировки' })
    await editor.getByLabel('Длительность, мин', { exact: true }).fill('18,5')
    await editor.getByRole('button', { name: 'Сохранить тренировку', exact: true }).click()
    await expect(editor).toHaveCount(0)
    expect((await read()).find(row => row.value.kind === second)?.value.minutes).toBe(18.5)
    for (const kind of [second, first]) {
      await page.getByRole('button', { name: new RegExp('^Удалить тренировку [0-9]+: ' + kind + '$') }).click()
      await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
      await expect(page.getByText(kind, { exact: true })).toHaveCount(0)
    }
    const before: unknown = await (await context.request.get('/api/v1/diary-state')).json()
    const rejected = await context.request.post('/api/v1/products', { headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { value: { id: randomUUID(), name: 'Синтетический\u0000продукт', source: '', kcal: 0, protein: null, fat: null, carbs: null, archived: false }, revision: null } })
    expect(rejected.status()).toBe(400)
    const after: unknown = await (await context.request.get('/api/v1/diary-state')).json()
    expect(after).toEqual(before)
  } finally {
    for (const row of await read()) if (row.value.kind.startsWith(tag) && !original.some(item => item.value.id === row.value.id)) {
      const removed = await context.request.delete('/api/v1/workouts/' + row.value.id,
        { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { revision: row.revision } })
      expect(removed.status()).toBe(204)
    }
    expect(await read()).toEqual(original)
  }
}

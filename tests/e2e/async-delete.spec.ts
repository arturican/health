import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import { readFullBackup } from '../../src/domain/fullBackup'

test.use({ timezoneId: 'Europe/Moscow' })

test('отложенная загрузка документа не возвращает удалённый дневник', async ({ page, baseURL }, info) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) external.push(request.url())
  })
  let release: () => void = () => { throw new Error('Нет задержанного запроса') }
  let paused: () => void = () => { throw new Error('Нет сигнала запроса') }
  let settled: (status: number) => void = () => { throw new Error('Нет результата') }
  const gate = new Promise<void>(resolve => { release = resolve })
  const arrived = new Promise<void>(resolve => { paused = resolve })
  const outcome = new Promise<number>(resolve => { settled = resolve })
  await page.route('**/api/v1/documents', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    paused()
    await gate
    // Send the original HTTP command after the diary generation changed.
    const response = await route.fetch()
    settled(response.status())
    await route.fulfill({ response })
  })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#documents')
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  const form = page.getByRole('form', { name: 'Добавление документа', exact: true })
  const title = 'Синтетический документ до удаления дневника'
  await form.getByLabel('Название документа', { exact: true }).fill(title)
  await form.getByLabel('Файл документа', { exact: true }).setInputFiles({
    name: 'synthetic-delayed-document.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSynthetic delayed document\n%%EOF\n'),
  })
  await form.getByRole('button', { name: 'Добавить документ', exact: true }).click()
  await arrived
  await expect(form.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled()
  await navigation.getByRole('link', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить весь дневник', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect(page.getByText('Все данные дневника удалены', { exact: true })).toBeVisible()
  release()
  expect(await outcome).toBe(409)
  await navigation.getByRole('link', { name: 'Документы', exact: true }).click()
  await expect(page.getByText('Документов пока нет.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Документов пока нет.', { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Настройки', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать полную копию', exact: true }).click()
  const download = await downloading
  const path = info.outputPath('synthetic-after-delayed-document.json')
  await download.saveAs(path)
  expect(await download.failure()).toBeNull()
  const input: unknown = JSON.parse(await readFile(path, 'utf8'))
  const backup = readFullBackup(input)
  expect(backup.text.profile).toBeNull()
  for (const records of [backup.text.weights, backup.text.products, backup.text.foodEntries,
    backup.text.nutritionDays, backup.text.steps, backup.text.workouts, backup.text.energyPlans]) {
    expect(records).toEqual([])
  }
  expect(backup.photos).toEqual([])
  expect(backup.documents).toEqual([])
  expect(backup.files).toEqual([])
  expect(backup.labResults).toEqual([])
  expect(backup.metadata).toEqual([])
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

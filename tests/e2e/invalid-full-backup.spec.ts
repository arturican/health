import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import { readFullBackup } from '../../src/domain/fullBackup'

test.use({ timezoneId: 'Europe/Moscow' })

test('повреждённая полная копия не даёт предпросмотра, сбрасывает старое согласие и сохраняет текущий дневник', async ({ page, baseURL }, info) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (new URL(request.url()).origin !== baseURL) external.push(request.url()) })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  await page.getByLabel('Имя (необязательно)').fill('Синтетический дневник до импорта')
  await page.getByLabel('Рост, см').fill('170')
  await page.getByLabel('Вес, кг').fill('70')
  await page.getByRole('button', { name: 'Создать профиль' }).click()
  await expect(page.getByText('Профиль и первое измерение сохранены', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  async function downloadCopy(name: string) {
    const ready = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Скачать полную копию', exact: true }).click()
    const download = await ready
    expect(download.suggestedFilename()).toBe('health-diary-full-2026-10-14.json')
    const path = info.outputPath(name)
    await download.saveAs(path)
    expect(await download.failure()).toBeNull()
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return { path, data: readFullBackup(parsed) }
  }
  const original = await downloadCopy('synthetic-original-full.json')
  const input = page.getByLabel('Файл полной копии', { exact: true })
  const check = page.getByRole('button', { name: 'Проверить полную копию', exact: true })
  const preview = page.getByRole('region', { name: 'Предпросмотр полной копии', exact: true })
  const consent = page.getByLabel('Согласен заменить весь дневник, включая файлы и показатели', { exact: true })
  await input.setInputFiles(original.path)
  await check.click()
  await expect(preview).toBeVisible()
  await consent.check()
  const documentId = '00000000-0000-4000-8000-000000000001'
  const fileId = '00000000-0000-4000-8000-000000000002'
  const documentRecord = { id: documentId, fileId, date: '2026-10-14', title: 'Синтетический бланк', kind: 'lab', note: '' }
  const invalidPdf = { id: fileId, purpose: 'document', mime: 'application/pdf', size: 1, base64: 'eA==' }
  const invalid = [
    Buffer.from('Синтетическая закрытая строка вместо JSON'),
    Buffer.from([255, 254]),
    Buffer.from(JSON.stringify({ ...original.data, version: 2 })),
    Buffer.from(JSON.stringify(original.data.text)),
    Buffer.from(JSON.stringify({ ...original.data, documents: [documentRecord] })),
    Buffer.from(JSON.stringify({ ...original.data, documents: [documentRecord], files: [invalidPdf] })),
    Buffer.from(JSON.stringify({ ...original.data, documents: [documentRecord], files: [{ ...invalidPdf, base64: 'AB==' }] })),
    Buffer.from(JSON.stringify({ ...original.data, labResults: [{ id: crypto.randomUUID(), documentId, date: '2026-10-14', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' }] })),
  ]
  for (const [index, buffer] of invalid.entries()) {
    await input.setInputFiles({ name: `synthetic-invalid-${String(index)}.json`, mimeType: 'application/json', buffer })
    await expect(preview).not.toBeVisible()
    await expect(consent).not.toBeVisible()
    await check.click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('alert')).not.toContainText('Синтетическая закрытая строка')
    await expect(preview).not.toBeVisible()
    await expect(input).toBeFocused()
  }
  const after = await downloadCopy('synthetic-after-invalid-full.json')
  expect(after.data).toEqual(original.data)
  await input.setInputFiles(original.path)
  await check.click()
  await expect(preview).toBeVisible()
  await expect(consent).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Восстановить полную копию', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Отменить полную копию', exact: true }).click()
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.getByText('Синтетический дневник до импорта', { exact: true })).toBeVisible()
  await expect(page.getByText('170 см', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Синтетический дневник до импорта', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures'
import { readFullBackup } from '../../src/domain/fullBackup'

test('отсутствующая прежняя база не создаётся при попытке скачать копию', async ({ page }) => {
  await page.goto('/#settings')
  await page.getByRole('button', { name: 'Скачать прежний дневник из браузера' }).click()
  await expect(page.getByRole('alert')).toHaveText('Прежняя база недоступна или не найдена в этом браузере.')
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([])
  await expect(page.getByRole('button', { name: 'Скачать полную копию', exact: true })).toBeEnabled()
})

test('явная копия прежнего браузера сохраняет PDF и источник без отправки в аккаунт', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#settings')
  await expect(page.getByRole('button', { name: 'Скачать прежний дневник из браузера' })).toBeVisible()
  const bytes = '%PDF-1.7\nSynthetic previous browser\n%%EOF\n'
  await page.evaluate(async bytes => {
    const request = indexedDB.open('health-diary', 120)
    request.onupgradeneeded = () => {
      const profile = request.result.createObjectStore('profiles', { keyPath: 'id' })
      profile.add({ id: 'self', name: 'Синтетический прежний профиль', heightCm: 170, birthDate: null, formulaSex: 'none' })
      const fileId = '20000000-0000-4000-8000-000000000001'
      const blob = new Blob([bytes], { type: 'application/pdf' })
      request.result.createObjectStore('files', { keyPath: 'id' }).add({ id: fileId, purpose: 'document', mime: blob.type, size: blob.size, blob })
      request.result.createObjectStore('documents', { keyPath: 'id' }).add({ id: '20000000-0000-4000-8000-000000000002', fileId, date: '2026-10-14', title: 'Учебный прежний PDF', kind: 'lab', note: '' })
    }
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => { reject(new Error('Не создана синтетическая база')) }
    })
  }, bytes)
  const mutations: string[] = []
  page.on('request', request => { if (request.method() !== 'GET') mutations.push(request.url()) })
  const ready = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать прежний дневник из браузера' }).click()
  const download = await ready
  const path = info.outputPath('synthetic-previous-browser.json')
  await download.saveAs(path)
  expect(await download.failure()).toBeNull()
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  const backup = readFullBackup(value, '2026-10-14')
  expect(backup.text.profile?.name).toBe('Синтетический прежний профиль')
  expect(backup.files[0]?.base64).toBe(Buffer.from(bytes).toString('base64'))
  expect(backup.documents).toHaveLength(1)
  expect(mutations).toEqual([])
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([{ name: 'health-diary', version: 120 }])
  const server: unknown = await page.evaluate(async () => {
    const response = await fetch('/api/v1/profile')
    const value: unknown = await response.json()
    return value
  })
  expect(server).toBeNull()
  const again = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать прежний дневник из браузера' }).click()
  const second = await again
  const secondPath = info.outputPath('synthetic-previous-browser-again.json')
  await second.saveAs(secondPath)
  expect(await readFile(secondPath, 'utf8')).toBe(await readFile(path, 'utf8'))
})

import Dexie from 'dexie'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import { DIARY_GENERATION_ID } from '../data/clearDiary'
import { exportTextBackup, restoreTextBackup } from '../data/backupRepository'
import { addPhoto } from '../data/photoRepository'
import { addDocument } from '../data/documentRepository'
import { addLabResult } from '../data/labRepository'
import { readFullBackup } from '../domain/fullBackup'
import { decodeBase64 } from '../domain/base64'
import type { TextBackup } from '../domain/backup'
import '../styles.css'

const observers: ((event: MouseEvent) => void)[] = []
const objectUrls = new Set<string>()
async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  const tables = [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans, db.files, db.photos, db.documents, db.labResults]
  await db.transaction('rw', tables, async () => { for (const table of tables) await table.clear() })
  window.history.replaceState(null, '', window.location.pathname)
}
beforeEach(async () => {
  await resetTestState()
  await page.viewport(375, 812)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  await resetTestState()
  for (const observer of observers) document.removeEventListener('click', observer, true)
  observers.length = 0
  vi.restoreAllMocks()
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
function captureDownloads() {
  const downloads: { href: string; name: string; response: Promise<Response> }[] = []
  const observer = (event: MouseEvent) => {
    const anchor = event.target
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.download) return
    downloads.push({ href: anchor.href, name: anchor.download, response: fetch(anchor.href) })
    event.preventDefault()
  }
  observers.push(observer)
  document.addEventListener('click', observer, true)
  const realCreate = URL.createObjectURL.bind(URL)
  const realRevoke = URL.revokeObjectURL.bind(URL)
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    const url = realCreate(blob)
    objectUrls.add(url)
    return url
  })
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { realRevoke(url); objectUrls.delete(url) })
  return { downloads, create, revoke }
}
async function syntheticPng() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического вложения нужен Canvas')
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, 64, 32)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетический PNG не создан')) }, 'image/png')
  })
}
const pdf = new Blob(['%PDF-1.7\nsynthetic-full-export-document\n%%EOF\n'], { type: 'application/pdf' })

test('настройки скачивают полную копию всех таблиц с точными файлами и освобождают URL и bitmap', async () => {
  const productId = crypto.randomUUID()
  const text: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile: { id: 'self', name: 'Синтетический профиль полной копии', heightCm: 170, birthDate: null, formulaSex: 'none' },
    weights: [{ id: crypto.randomUUID(), date: '2026-10-14', kg: 70.5 }],
    products: [{ id: productId, name: 'Синтетический архивный продукт', source: 'Синтетическая этикетка', kcal: 0, protein: null, fat: 0, carbs: null, archived: true }],
    foodEntries: [{ id: crypto.randomUUID(), date: '2026-10-14', meal: 'lunch', productId, grams: 100, snapshot: { name: 'Прежнее синтетическое название', source: '', kcal: 123.5, protein: null, fat: 0, carbs: null }, note: '' }],
    nutritionDays: [{ date: '2026-10-14', complete: false }], steps: [{ date: '2026-10-14', count: 0 }],
    workouts: [{ id: crypto.randomUUID(), date: '2026-10-14', kind: 'Синтетическая прогулка', minutes: 12.5, kcal: null, source: '', note: '' }],
    energyPlans: [{ id: crypto.randomUUID(), revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-14', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: 'Синтетический план', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70.5, weightDate: '2026-10-14', heightCm: 170, age: null, formulaSex: 'none' } }],
  }
  await restoreTextBackup(text)
  const metadata = [{ id: 'catalog-seeded', value: 'done' }, { id: 'synthetic-setting', value: 'Синтетическая настройка ≤' }]
  await db.metadata.bulkPut(metadata)
  const metadataBefore = await db.metadata.toArray()
  const generation = await db.metadata.get(DIARY_GENERATION_ID)
  expect(generation?.id).toBe(DIARY_GENERATION_ID)
  expect(generation?.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  const png = await syntheticPng()
  const photo = await addPhoto({ date: '2026-10-14', title: 'Синтетическая зелёная геометрия', note: '' }, png)
  const pdfDocument = await addDocument({ date: '2026-10-13', title: 'Синтетический PDF бланк', kind: 'lab', note: '' }, pdf)
  const pngDocument = await addDocument({ date: '2026-10-14', title: 'Синтетический PNG документ', kind: 'imaging', note: '' }, png)
  const lab = await addLabResult({ documentId: pdfDocument.id, date: '2026-10-13', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'lte' }, unit: 'условные единицы', reference: '≤ 0,0000002; без интерпретации', note: '' })
  const filesBefore = await db.files.toArray()
  const documentsBefore = await db.documents.toArray()
  const realDecode = globalThis.createImageBitmap.bind(globalThis)
  const decode = vi.spyOn(globalThis, 'createImageBitmap').mockImplementation((...args) => {
    expect(Dexie.currentTransaction).toBeNull()
    return realDecode(...args)
  })
  const { downloads, create, revoke } = captureDownloads()
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 2, name: 'Полная резервная копия', exact: true })).toBeVisible()
  const button = page.getByRole('button', { name: 'Скачать полную копию', exact: true })
  let locked = false
  let release = false
  const lock = db.transaction('rw', db.metadata, async () => {
    locked = true
    while (!release) await db.metadata.count()
  })
  await expect.poll(() => locked).toBe(true)
  try {
    await button.click()
    await expect.element(page.getByRole('button', { name: 'Готовим полную копию…', exact: true })).toBeDisabled()
    await userEvent.keyboard('{Enter}')
    expect(downloads).toEqual([])
  } finally { release = true; await lock }
  await expect.element(page.getByRole('status').filter({ hasText: 'Полная копия подготовлена' })).toHaveTextContent('Полная копия подготовлена')
  await expect.element(button).toBeEnabled()
  expect(downloads).toHaveLength(1)
  const download = downloads[0]
  if (!download) throw new Error('Нужно настоящее локальное скачивание полной копии')
  expect(download.name).toBe('health-diary-full-2026-10-14.json')
  const response = await download.response
  expect(response.headers.get('Content-Type')).toBe('application/json')
  const parsed: unknown = JSON.parse(await response.text())
  const backup = readFullBackup(parsed)
  expect(backup.text).toEqual(text)
  expect(backup.metadata).toEqual(metadata)
  expect(backup.metadata.some(row => row.id === DIARY_GENERATION_ID)).toBe(false)
  expect(backup.photos).toEqual([photo])
  expect(backup.documents).toEqual(documentsBefore)
  expect(backup.labResults).toEqual([lab])
  expect(backup.files).toHaveLength(3)
  for (const file of backup.files) {
    const original = filesBefore.find(record => record.id === file.id)
    if (!original) throw new Error('Файл копии должен иметь сохранённый оригинал')
    expect({ id: file.id, purpose: file.purpose, mime: file.mime, size: file.size }).toEqual({ id: original.id, purpose: original.purpose, mime: original.mime, size: original.size })
    expect(decodeBase64(file.base64, file.size)).toEqual(new Uint8Array(await original.blob.arrayBuffer()))
  }
  expect(backup.files.find(file => file.id === pngDocument.fileId)?.mime).toBe('image/png')
  expect(decode).toHaveBeenCalledTimes(2)
  for (const result of decode.mock.results) {
    const bitmap: unknown = await result.value
    if (!(bitmap instanceof ImageBitmap)) throw new Error('Нужен настоящий bitmap проверки копии')
    expect([bitmap.width, bitmap.height]).toEqual([0, 0])
  }
  expect(create).toHaveBeenCalledTimes(1)
  expect(revoke).toHaveBeenCalledExactlyOnceWith(download.href)
  await expect(fetch(download.href)).rejects.toThrow()
  expect(document.querySelector('a[download]')).toBeNull()
  const afterText = await exportTextBackup()
  expect(afterText.exportedAt).toBe(new Date().toISOString())
  expect({ ...afterText, exportedAt: text.exportedAt }).toEqual(text)
  expect(await db.metadata.toArray()).toEqual(metadataBefore)
  expect(await db.documents.toArray()).toEqual(documentsBefore)
  expect(await db.photos.toArray()).toEqual([photo])
  expect(await db.labResults.toArray()).toEqual([lab])
  const filesAfter = await db.files.toArray()
  expect(filesAfter.map(file => ({ ...file, blob: null }))).toEqual(filesBefore.map(file => ({ ...file, blob: null })))
  for (const [index, file] of filesAfter.entries()) {
    const before = filesBefore[index]
    if (!before) throw new Error('У файла после экспорта должен быть исходный снимок')
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(new Uint8Array(await before.blob.arrayBuffer()))
  }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

test('отсутствующий или повреждённый файл блокирует download без изменения данных', async () => {
  const documentRecord = await addDocument({ date: '2026-10-14', title: 'Синтетическая приватная подпись', kind: 'lab', note: '' }, pdf)
  const original = await db.files.get(documentRecord.fileId)
  if (!original) throw new Error('Для синтетической проверки нужен файл')
  const { downloads, create } = captureDownloads()
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const button = page.getByRole('button', { name: 'Скачать полную копию', exact: true })
  await db.files.delete(original.id)
  await button.click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Нарушены связи файлов полной копии')
  expect(await db.documents.toArray()).toEqual([documentRecord])
  expect(await db.files.count()).toBe(0)
  const corruptBlob = new Blob(['<html>synthetic-private-file-body</html>'], { type: 'application/pdf' })
  const corrupt = { ...original, blob: corruptBlob, size: corruptBlob.size }
  await db.files.add(corrupt)
  await button.click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Неподдерживаемый формат вложения')
  expect(downloads).toEqual([])
  expect(create).not.toHaveBeenCalled()
  expect(document.querySelector('a[download]')).toBeNull()
  expect(view.container.textContent).not.toContain(documentRecord.title)
  expect(view.container.textContent).not.toContain('synthetic-private-file-body')
  expect(await db.documents.toArray()).toEqual([documentRecord])
  const retained = await db.files.get(original.id)
  if (!retained) throw new Error('Отказ экспорта не должен менять повреждённую запись')
  expect({ ...retained, blob: null }).toEqual({ ...corrupt, blob: null })
  expect(new Uint8Array(await retained.blob.arrayBuffer())).toEqual(new Uint8Array(await corruptBlob.arrayBuffer()))
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

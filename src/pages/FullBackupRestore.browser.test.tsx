import Dexie from 'dexie'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import { restoreTextBackup } from '../data/backupRepository'
import { exportFullBackup } from '../data/fullBackupRepository'
import { addPhoto } from '../data/photoRepository'
import { addDocument } from '../data/documentRepository'
import { addLabResult } from '../data/labRepository'
import { decodeBase64 } from '../domain/base64'
import { serializeFullBackup, type FullBackup } from '../domain/fullBackup'
import type { TextBackup } from '../domain/backup'
import '../styles.css'

async function clearDatabase() {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  const tables = [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans, db.files, db.photos, db.documents, db.labResults]
  await db.transaction('rw', tables, async () => { for (const table of tables) await table.clear() })
}
beforeEach(async () => {
  await cleanup()
  await clearDatabase()
  window.history.replaceState(null, '', window.location.pathname)
  await page.viewport(375, 812)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  await cleanup()
  await clearDatabase()
  window.history.replaceState(null, '', window.location.pathname)
  vi.restoreAllMocks()
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function populate(label: string, color: string) {
  const productId = crypto.randomUUID()
  const text: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile: { id: 'self', name: `Синтетический профиль ${label}`, heightCm: 170, birthDate: null, formulaSex: 'none' },
    weights: [{ id: crypto.randomUUID(), date: '2026-10-14', kg: 70 }],
    products: [{ id: productId, name: `Синтетический продукт ${label}`, source: '', kcal: 0, protein: null, fat: 0, carbs: null, archived: true }],
    foodEntries: [{ id: crypto.randomUUID(), date: '2026-10-14', meal: 'lunch', productId, grams: 100, snapshot: { name: `Синтетический снимок ${label}`, source: '', kcal: 123.5, protein: null, fat: 0, carbs: null }, note: '' }],
    nutritionDays: [{ date: '2026-10-14', complete: false }], steps: [{ date: '2026-10-14', count: label === 'imported' ? 0 : 99 }],
    workouts: [{ id: crypto.randomUUID(), date: '2026-10-14', kind: `Синтетическая прогулка ${label}`, minutes: 12.5, kcal: null, source: '', note: '' }],
    energyPlans: [{ id: crypto.randomUUID(), revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-14', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: label, restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70, weightDate: '2026-10-14', heightCm: 170, age: null, formulaSex: 'none' } }],
  }
  await restoreTextBackup(text)
  await db.metadata.bulkPut([{ id: 'catalog-seeded', value: 'done' }, { id: `synthetic-${label}`, value: label }])
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетической копии нужен Canvas')
  context.fillStyle = color
  context.fillRect(0, 0, 64, 32)
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетический PNG не создан')) }, 'image/png')
  })
  await addPhoto({ date: '2026-10-14', title: `Синтетическое фото ${label}`, note: '' }, png)
  const documentRecord = await addDocument({ date: '2026-10-13', title: `Синтетический PDF ${label}`, kind: 'lab', note: '' },
    new Blob([`%PDF-1.7\nsynthetic-restored-document-${label}\n%%EOF\n`], { type: 'application/pdf' }))
  await addLabResult({ documentId: documentRecord.id, date: '2026-10-13', name: `Синтетический показатель ${label}`, value: { type: 'number', number: 0, operator: 'lte' }, unit: '', reference: '≤ 0,0000002; без интерпретации', note: '' })
  return exportFullBackup()
}
async function expectDatabase(expected: FullBackup) {
  const actual = await exportFullBackup()
  expect({ ...actual, text: { ...actual.text, exportedAt: expected.text.exportedAt } }).toEqual(expected)
}

test('полное восстановление требует согласия, откатывает поздний отказ и заменяет все таблицы с настоящими файлами', async () => {
  const imported = await populate('imported', '#00ff00')
  const importedFile = new File([serializeFullBackup(imported)], 'synthetic-imported-diary.json', { type: 'application/json' })
  await clearDatabase()
  const current = await populate('current', '#ff0000')
  const realDecode = globalThis.createImageBitmap.bind(globalThis)
  const decode = vi.spyOn(globalThis, 'createImageBitmap').mockImplementation((...args) => {
    expect(Dexie.currentTransaction).toBeNull()
    return realDecode(...args)
  })
  let view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const file = page.getByLabelText('Файл полной копии', { exact: true })
  const check = page.getByRole('button', { name: 'Проверить полную копию', exact: true })
  const preview = page.getByRole('region', { name: 'Предпросмотр полной копии', exact: true })
  const consent = page.getByLabelText('Согласен заменить весь дневник, включая файлы и показатели', { exact: true })
  const restore = page.getByRole('button', { name: 'Восстановить полную копию', exact: true })
  const cancel = page.getByRole('button', { name: 'Отменить полную копию', exact: true })
  await file.upload(importedFile)
  await check.click()
  await expect.element(preview).toBeVisible()
  await expect.element(restore).toBeDisabled()
  await expect.element(consent).not.toBeChecked()
  await expectDatabase(current)
  await consent.click()
  await expect.element(restore).toBeEnabled()
  await cancel.click()
  await expect.element(preview).not.toBeInTheDocument()
  await expect.element(file).toHaveFocus()
  await expectDatabase(current)
  await check.click()
  await expect.element(consent).not.toBeChecked()
  await expect.element(restore).toBeDisabled()
  await consent.click()
  await file.upload(new File([serializeFullBackup(imported)], 'synthetic-reselected-diary.json', { type: 'application/json' }))
  await expect.element(preview).not.toBeInTheDocument()
  await check.click()
  await expect.element(consent).not.toBeChecked()
  await expect.element(restore).toBeDisabled()
  await consent.click()
  const written = new Set<string>()
  const unsubscribe: (() => void)[] = []
  for (const name of db.tables.map(table => table.name)) {
    const table = db.table<unknown, string>(name)
    const observe = () => { written.add(name) }
    table.hook('creating', observe)
    unsubscribe.push(() => { table.hook('creating').unsubscribe(observe) })
  }
  const failure = () => { throw new DOMException('synthetic-private-storage-failure', 'QuotaExceededError') }
  db.labResults.hook('creating', failure)
  let locked = false
  let release = false
  const lock = db.transaction('rw', db.metadata, async () => {
    locked = true
    while (!release) await db.metadata.count()
  })
  await expect.poll(() => locked).toBe(true)
  try {
    try {
      await restore.click()
      await expect.element(page.getByRole('button', { name: 'Восстанавливаем полную копию…', exact: true })).toBeDisabled()
      await expect.element(file).toBeDisabled()
      await expect.element(check).toBeDisabled()
      await expect.element(consent).toBeDisabled()
      await expect.element(cancel).toBeDisabled()
      await userEvent.keyboard('{Enter}')
    } finally { release = true; await lock }
    await expect.element(page.getByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    await expect.element(consent).toHaveFocus()
    await expect.element(consent).toBeChecked()
    await expect.element(preview).toBeVisible()
  } finally {
    db.labResults.hook('creating').unsubscribe(failure)
    unsubscribe.forEach(remove => { remove() })
  }
  expect(written.size).toBe(13)
  expect(view.container.textContent).not.toContain('synthetic-private-storage-failure')
  await expectDatabase(current)
  await expect.element(restore).toBeEnabled()
  expect((await axe.run(view.container)).violations).toEqual([])
  await userEvent.keyboard('{Tab}')
  await expect.element(restore).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('status').filter({ hasText: 'Полная копия восстановлена' })).toHaveTextContent('Полная копия восстановлена')
  await expect.element(preview).not.toBeInTheDocument()
  await expect.element(file).toHaveFocus()
  await expectDatabase(imported)
  for (const record of current.files) expect(await db.files.get(record.id)).toBeUndefined()
  await page.getByRole('link', { name: 'Фото', exact: true }).click()
  const photo = imported.photos[0]
  const documentRecord = imported.documents[0]
  const lab = imported.labResults[0]
  if (!photo || !documentRecord || !lab) throw new Error('В копии нужны синтетические фото, документ и показатель')
  const imageLocator = page.getByRole('img', { name: photo.title, exact: true })
  await expect.element(imageLocator).toBeVisible()
  const image = imageLocator.element()
  if (!(image instanceof HTMLImageElement)) throw new Error('Нужно настоящее восстановленное изображение')
  await image.decode()
  expect([image.naturalWidth, image.naturalHeight]).toEqual([64, 32])
  const encoded = imported.files.find(record => record.id === photo.fileId)
  if (!encoded) throw new Error('В копии нужен файл фотографии')
  expect(new Uint8Array(await (await fetch(image.src)).arrayBuffer())).toEqual(decodeBase64(encoded.base64, encoded.size))
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для проверки синтетического пикселя нужен Canvas')
  context.drawImage(image, 32, 16, 1, 1, 0, 0, 1, 1)
  expect(context.getImageData(0, 0, 1, 1).data[1]).toBeGreaterThan(240)
  await page.getByRole('link', { name: 'Документы', exact: true }).click()
  await expect.element(page.getByRole('button', { name: `Скачать оригинал: ${documentRecord.title}`, exact: true })).toBeVisible()
  await page.getByLabelText('Бланк для показателей', { exact: true }).selectOptions(documentRecord.id)
  await expect.element(page.getByRole('list', { name: 'Показатели выбранного документа', exact: true })).toHaveTextContent(lab.name)
  await view.unmount()
  view = await render(<App />)
  await expect.element(page.getByRole('button', { name: `Скачать оригинал: ${documentRecord.title}`, exact: true })).toBeVisible()
  await expectDatabase(imported)
  for (const result of decode.mock.results) {
    const bitmap: unknown = await result.value
    if (!(bitmap instanceof ImageBitmap)) throw new Error('Проверка должна использовать настоящий bitmap')
    expect([bitmap.width, bitmap.height]).toEqual([0, 0])
  }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

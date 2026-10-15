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
import { decodeBase64, encodeBase64 } from '../domain/base64'
import { serializeFullBackup } from '../domain/fullBackup'
import type { TextBackup } from '../domain/backup'
import '../styles.css'

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
  vi.restoreAllMocks()
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function syntheticPng() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетической копии нужен Canvas')
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, 64, 32)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетический PNG не создан')) }, 'image/png')
  })
}
function jsonFile(input: unknown, name = 'synthetic-full-backup.json') {
  return new File([JSON.stringify(input)], name, { type: 'application/json' })
}

test('полная копия проверяется настоящим декодером, показывает состав и отвергает повреждения без записи', async () => {
  const productId = crypto.randomUUID()
  const text: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile: { id: 'self', name: 'Синтетический профиль предпросмотра', heightCm: 170, birthDate: null, formulaSex: 'none' },
    weights: [{ id: crypto.randomUUID(), date: '2026-10-14', kg: 70 }],
    products: [{ id: productId, name: 'Синтетический продукт', source: '', kcal: 0, protein: null, fat: 0, carbs: null, archived: true }],
    foodEntries: [{ id: crypto.randomUUID(), date: '2026-10-14', meal: 'lunch', productId, grams: 100, snapshot: { name: 'Синтетический снимок', source: '', kcal: 123.5, protein: null, fat: 0, carbs: null }, note: '' }],
    nutritionDays: [{ date: '2026-10-14', complete: false }], steps: [{ date: '2026-10-14', count: 0 }],
    workouts: [{ id: crypto.randomUUID(), date: '2026-10-14', kind: 'Синтетическая прогулка', minutes: 12.5, kcal: null, source: '', note: '' }],
    energyPlans: [{ id: crypto.randomUUID(), revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-14', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70, weightDate: '2026-10-14', heightCm: 170, age: null, formulaSex: 'none' } }],
  }
  await restoreTextBackup(text)
  await db.metadata.put({ id: 'synthetic-setting', value: 'Сохранить настройку' })
  await addPhoto({ date: '2026-10-14', title: 'Синтетическая зелёная геометрия', note: '' }, await syntheticPng())
  const source = await addDocument({ date: '2026-10-13', title: 'Синтетический PDF предпросмотра', kind: 'lab', note: '' },
    new Blob(['%PDF-1.7\nsynthetic-preview-document\n%%EOF\n'], { type: 'application/pdf' }))
  await addLabResult({ documentId: source.id, date: '2026-10-13', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'lte' }, unit: '', reference: '≤ 0,0000002; как на бланке', note: '' })
  const before = await exportFullBackup()
  async function expectUnchangedDatabase() {
    const after = await exportFullBackup()
    expect({ ...after, text: { ...after.text, exportedAt: before.text.exportedAt } }).toEqual(before)
  }
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 2, name: 'Восстановление полной копии', exact: true })).toBeVisible()
  const form = page.getByRole('form', { name: 'Импорт полной копии', exact: true })
  const file = form.getByLabelText('Файл полной копии', { exact: true })
  const check = form.getByRole('button', { name: 'Проверить полную копию', exact: true })
  const preview = page.getByRole('region', { name: 'Предпросмотр полной копии', exact: true })
  const notice = page.getByRole('status').filter({ hasText: 'Полная копия проверена; база не изменена' })
  const decode = vi.spyOn(globalThis, 'createImageBitmap')
  await file.upload(new File([serializeFullBackup(before)], 'synthetic-full-preview.json', { type: 'application/json' }))
  await check.click()
  await expect.element(notice).toHaveTextContent('Полная копия проверена; база не изменена')
  await expect.element(preview).toBeVisible()
  await expect.element(preview.getByRole('heading', { level: 3, name: 'Предпросмотр полной копии', exact: true })).toHaveFocus()
  await expect.element(preview).toHaveTextContent(before.text.exportedAt)
  await expect.element(preview).toHaveTextContent('Профилей: 1')
  await expect.element(preview).toHaveTextContent('Измерений веса: 1')
  await expect.element(preview).toHaveTextContent('Продуктов: 1')
  await expect.element(preview).toHaveTextContent('Записей еды: 1')
  await expect.element(preview).toHaveTextContent('Отметок полноты: 1')
  await expect.element(preview).toHaveTextContent('Итогов шагов: 1')
  await expect.element(preview).toHaveTextContent('Тренировок: 1')
  await expect.element(preview).toHaveTextContent('Версий плана: 1')
  await expect.element(preview).toHaveTextContent('Фото: 1')
  await expect.element(preview).toHaveTextContent('Документов: 1')
  await expect.element(preview).toHaveTextContent('Показателей: 1')
  await expect.element(preview).toHaveTextContent('Файлов: 2')
  await expect.element(preview).toHaveTextContent(String(before.files.reduce((sum, record) => sum + record.size, 0)))
  await expect.element(preview).toHaveTextContent('Настроек: 1')
  await expect.element(page.getByRole('button', { name: 'Восстановить полную копию', exact: true })).toBeDisabled()
  expect(decode).toHaveBeenCalledTimes(1)
  const decoded: unknown = await decode.mock.results[0]?.value
  if (!(decoded instanceof ImageBitmap)) throw new Error('Предпросмотр должен использовать настоящий bitmap')
  expect([decoded.width, decoded.height]).toEqual([0, 0])
  decode.mockRestore()
  await expectUnchangedDatabase()
  expect((await axe.run(view.container)).violations).toEqual([])
  await file.upload(jsonFile(before, 'synthetic-reselected-full.json'))
  await expect.element(preview).not.toBeInTheDocument()
  await expect.element(notice).not.toBeInTheDocument()
  await check.click()
  await expect.element(preview).toBeVisible()
  await page.getByRole('button', { name: 'Отменить полную копию', exact: true }).click()
  await expect.element(preview).not.toBeInTheDocument()
  await expect.element(file).toHaveFocus()
  await userEvent.keyboard('{Tab}')
  await expect.element(check).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(preview).toBeVisible()
  await page.getByRole('button', { name: 'Отменить полную копию', exact: true }).click()
  await expect.element(file).toHaveFocus()
  await expectUnchangedDatabase()
  const photoFile = before.files.find(record => record.purpose === 'photo')
  if (!photoFile) throw new Error('В синтетической копии нужен подготовленный JPEG')
  const photoBytes = decodeBase64(photoFile.base64, photoFile.size)
  const exif = new Uint8Array(36)
  exif.set([255, 225, 0, 34])
  exif.set(new TextEncoder().encode('Exif\0\0'), 4)
  const tiff = new DataView(exif.buffer, 10)
  tiff.setUint16(0, 0x4949, true)
  tiff.setUint16(2, 42, true)
  tiff.setUint32(4, 8, true)
  tiff.setUint16(8, 1, true)
  tiff.setUint16(10, 274, true)
  tiff.setUint16(12, 3, true)
  tiff.setUint32(14, 1, true)
  tiff.setUint16(18, 1, true)
  const exifBytes = new Uint8Array(photoBytes.length + exif.length)
  exifBytes.set(photoBytes.subarray(0, 2))
  exifBytes.set(exif, 2)
  exifBytes.set(photoBytes.subarray(2), 2 + exif.length)
  const tailExifBytes = new Uint8Array(photoBytes.length + exif.length)
  tailExifBytes.set(photoBytes.subarray(0, -2))
  tailExifBytes.set(exif, photoBytes.length - 2)
  tailExifBytes.set(photoBytes.subarray(-2), photoBytes.length - 2 + exif.length)
  const tailBitmap = await createImageBitmap(new Blob([tailExifBytes], { type: 'image/jpeg' }))
  try { expect([tailBitmap.width, tailBitmap.height]).toEqual([64, 32]) }
  finally { tailBitmap.close() }
  const privateBytes = new TextEncoder().encode('<html>synthetic-private-backup-content</html>')
  const invalidCopies: unknown[] = [
    { ...before, format: 'synthetic-private-wrong-format' }, before.text,
    { ...before, files: before.files.map(record => record.purpose === 'document' ? { ...record, size: privateBytes.length, base64: encodeBase64(privateBytes) } : record) },
    { ...before, files: before.files.map(record => record.id === photoFile.id ? { ...record, size: exifBytes.length, base64: encodeBase64(exifBytes) } : record) },
    { ...before, files: before.files.map(record => record.id === photoFile.id ? { ...record, size: tailExifBytes.length, base64: encodeBase64(tailExifBytes) } : record) },
  ]
  for (const invalid of invalidCopies) {
    await file.upload(jsonFile(invalid, 'synthetic-invalid-full.json'))
    await check.click()
    await expect.element(page.getByRole('alert')).toBeVisible()
    await expect.element(file).toHaveFocus()
    await expect.element(preview).not.toBeInTheDocument()
    expect(view.container.textContent).not.toContain('synthetic-private-backup-content')
    expect(view.container.textContent).not.toContain('synthetic-private-wrong-format')
    await expectUnchangedDatabase()
  }
  await expect.element(page.getByRole('alert')).toHaveTextContent('Подготовленное фото в копии содержит EXIF')
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

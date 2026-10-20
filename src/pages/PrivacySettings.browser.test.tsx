import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import { addPhoto } from '../data/photoRepository'
import { addDocument } from '../data/documentRepository'
import { addLabResult } from '../data/labRepository'
import { getVisibility, saveVisibility } from '../data/visibilityRepository'
import { exportFullBackup } from '../data/fullBackupRepository'
import { VISIBILITY_SETTING_ID } from '../domain/visibility'
import type { FullBackup } from '../domain/fullBackup'
import '../styles.css'

const urls = new Set<string>()
const unsubscribe: (() => void)[] = []
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
  unsubscribe.forEach(remove => { remove() })
  unsubscribe.length = 0
  await resetTestState()
  vi.restoreAllMocks()
  for (const url of urls) URL.revokeObjectURL(url)
  urls.clear()
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function populate() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического фото нужен Canvas')
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, 64, 32)
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетический PNG не создан')) }, 'image/png')
  })
  await db.metadata.put({ id: 'synthetic-preserved', value: 'Сохранить настройку' })
  const photo = await addPhoto({ date: '2026-10-14', title: 'Синтетическое фото видимости', note: '' }, png)
  const documentRecord = await addDocument({ date: '2026-10-14', title: 'Синтетический бланк видимости', kind: 'lab', note: '' },
    new Blob(['%PDF-1.7\nsynthetic-visibility-ui\n%%EOF\n'], { type: 'application/pdf' }))
  const lab = await addLabResult({ documentId: documentRecord.id, date: '2026-10-14', name: 'Синтетический показатель видимости', value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' })
  return { photo, documentRecord, lab, before: await exportFullBackup() }
}
async function expectPreserved(before: FullBackup) {
  const after = await exportFullBackup()
  expect({ ...after, metadata: after.metadata.filter(row => row.id !== VISIBILITY_SETTING_ID), text: { ...after.text, exportedAt: before.text.exportedAt } }).toEqual(before)
}
async function expectNavigation(showPhotos: boolean, showDocuments: boolean) {
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  if (showPhotos) await expect.element(navigation.getByRole('link', { name: 'Фото', exact: true })).toBeVisible()
  else await expect.element(navigation.getByRole('link', { name: 'Фото', exact: true })).not.toBeInTheDocument()
  if (showDocuments) await expect.element(navigation.getByRole('link', { name: 'Документы', exact: true })).toBeVisible()
  else await expect.element(navigation.getByRole('link', { name: 'Документы', exact: true })).not.toBeInTheDocument()
}

test('сохранённые флаги управляют меню и прямыми маршрутами, скрытие освобождает URL и сохраняет файлы', async () => {
  const { photo, documentRecord, lab, before } = await populate()
  const reads = { photos: 0, documents: 0, files: 0 }
  for (const name of ['photos', 'documents', 'files'] as const) {
    const table = db.table<unknown, string>(name)
    const observe = (value: unknown) => { reads[name]++; return value }
    table.hook('reading', observe)
    unsubscribe.push(() => { table.hook('reading').unsubscribe(observe) })
  }
  const realCreate = URL.createObjectURL.bind(URL)
  const realRevoke = URL.revokeObjectURL.bind(URL)
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    const url = realCreate(blob)
    urls.add(url)
    return url
  })
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { realRevoke(url); urls.delete(url) })
  window.history.replaceState(null, '', '#photos')
  let locked = false
  let release = false
  const lock = db.transaction('rw', db.metadata, async () => { locked = true; while (!release) await db.metadata.count() })
  await expect.poll(() => locked).toBe(true)
  let view
  try {
    view = await render(<App />)
    await expect.element(page.getByRole('status').filter({ hasText: 'Загружаем настройки видимости…' })).toBeVisible()
    await expectNavigation(false, false)
    expect(reads).toEqual({ photos: 0, documents: 0, files: 0 })
  } finally { release = true; await lock }
  const imageLocator = page.getByRole('img', { name: photo.title, exact: true })
  await expect.element(imageLocator).toBeVisible()
  const image = imageLocator.element()
  if (!(image instanceof HTMLImageElement)) throw new Error('Нужно настоящее синтетическое фото')
  await image.decode()
  expect([image.naturalWidth, image.naturalHeight]).toEqual([64, 32])
  const url = image.src
  const visibleReads = { ...reads }
  await saveVisibility({ version: 1, showPhotos: false, showDocuments: true })
  const hidden = page.getByRole('heading', { level: 1, name: 'Раздел скрыт', exact: true })
  const settingsLink = page.getByRole('link', { name: 'Открыть настройки видимости', exact: true })
  await expect.element(hidden).toBeVisible()
  await expect.element(imageLocator).not.toBeInTheDocument()
  expect(revoke).toHaveBeenCalledExactlyOnceWith(url)
  expect(reads).toEqual(visibleReads)
  await expect(fetch(url)).rejects.toThrow()
  await settingsLink.click()
  const photos = page.getByLabelText('Показывать фото', { exact: true })
  const documents = page.getByLabelText('Показывать документы и показатели', { exact: true })
  const save = page.getByRole('button', { name: 'Сохранить видимость', exact: true })
  await expect.element(photos).not.toBeChecked()
  await expect.element(documents).toBeChecked()
  await photos.click()
  await expectNavigation(false, true)
  await userEvent.keyboard('{Tab}{Tab}')
  await expect.element(save).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expectNavigation(true, true)
  await expect.element(save).toHaveFocus()
  let currentPhotos = true
  let currentDocuments = true
  const combinations: [boolean, boolean][] = [[false, false], [true, false], [false, true], [true, true]]
  for (const [showPhotos, showDocuments] of combinations) {
    if (showPhotos !== currentPhotos) await photos.click()
    if (showDocuments !== currentDocuments) await documents.click()
    await expectNavigation(currentPhotos, currentDocuments)
    await save.click()
    await expectNavigation(showPhotos, showDocuments)
    expect(await getVisibility()).toEqual({ version: 1, showPhotos, showDocuments })
    currentPhotos = showPhotos
    currentDocuments = showDocuments
    if (!showPhotos && !showDocuments) {
      const beforeHiddenRoutes = { ...reads }
      window.location.hash = '#photos'
      await expect.element(hidden).toBeVisible()
      await settingsLink.click()
      window.location.hash = '#documents'
      await expect.element(hidden).toBeVisible()
      window.history.back()
      await expect.element(page.getByRole('heading', { level: 1, name: 'Настройки', exact: true })).toBeVisible()
      window.history.forward()
      await expect.element(hidden).toBeVisible()
      await view.unmount()
      view = await render(<App />)
      await expect.element(hidden).toBeVisible()
      expect(reads).toEqual(beforeHiddenRoutes)
      await settingsLink.click()
    }
  }
  await view.unmount()
  view = await render(<App />)
  await expect.element(photos).toBeChecked()
  await expect.element(documents).toBeChecked()
  await expectNavigation(true, true)
  await page.getByRole('link', { name: 'Документы', exact: true }).click()
  await openAttachment(documentRecord.title)
  await expect.element(page.getByRole('button', { name: `Скачать оригинал: ${documentRecord.title}`, exact: true })).toBeVisible()
  await page.getByLabelText('Бланк для показателей', { exact: true }).selectOptions(documentRecord.id)
  await expect.element(page.getByRole('list', { name: 'Показатели выбранного документа', exact: true })).toHaveTextContent(lab.name)
  await expectPreserved(before)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

test('отказ записи сохраняет черновик, ошибка чтения сохраняет известную видимость и блокирует запись до восстановления', async () => {
  const { before } = await populate()
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const photos = page.getByLabelText('Показывать фото', { exact: true })
  const documents = page.getByLabelText('Показывать документы и показатели', { exact: true })
  const save = page.getByRole('button', { name: 'Сохранить видимость', exact: true })
  await expect.element(photos).toBeChecked()
  await saveVisibility({ version: 1, showPhotos: true, showDocuments: true })
  await photos.click()
  const failure = () => { throw new DOMException('synthetic-private-quota', 'QuotaExceededError') }
  db.metadata.hook('updating', failure)
  try {
    await save.click()
    await expect.element(page.getByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    await expect.element(save).toHaveFocus()
  } finally { db.metadata.hook('updating').unsubscribe(failure) }
  await expect.element(photos).not.toBeChecked()
  await expectNavigation(true, true)
  expect(await getVisibility()).toEqual({ version: 1, showPhotos: true, showDocuments: true })
  expect(view.container.textContent).not.toContain('synthetic-private-quota')
  await userEvent.keyboard('{Enter}')
  await expectNavigation(false, true)
  await expect.element(save).toHaveFocus()
  await db.metadata.put({ id: VISIBILITY_SETTING_ID, value: 'synthetic-private-corrupt-json' })
  await expect.element(page.getByRole('alert')).toHaveTextContent('Не удалось прочитать настройки видимости.')
  await expectNavigation(false, true)
  await expect.element(photos).not.toBeChecked()
  await expect.element(documents).toBeChecked()
  await expect.element(save).toBeDisabled()
  await expect.element(page.getByRole('button', { name: 'Повторить загрузку настроек' })).toBeEnabled()
  window.location.hash = '#photos'
  await expect.element(page.getByRole('heading', { level: 1, name: 'Раздел скрыт', exact: true })).toBeVisible()
  await expect.element(page.getByRole('img')).not.toBeInTheDocument()
  await page.getByRole('link', { name: 'Открыть настройки видимости', exact: true }).click()
  await expect.element(save).toBeDisabled()
  await saveVisibility({ version: 1, showPhotos: true, showDocuments: true })
  await expect.element(save).toBeEnabled()
  await save.click()
  await expect.element(page.getByRole('status').filter({ hasText: 'Видимость разделов сохранена' })).toHaveTextContent('Видимость разделов сохранена')
  await expectNavigation(true, true)
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  await expect.element(save).toHaveFocus()
  expect(view.container.textContent).not.toContain('synthetic-private-corrupt-json')
  await expectPreserved(before)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

async function openAttachment(title: string) {
  const label = 'Открыть вложение: ' + title
  if (!Array.from(document.querySelectorAll('button')).some(button => button.getAttribute('aria-label') === 'Закрыть вложение: ' + title)) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
}

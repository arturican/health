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
import { getVisibility, saveVisibility } from '../data/visibilityRepository'
import { DEFAULT_VISIBILITY } from '../domain/visibility'
import { serializeFullBackup } from '../domain/fullBackup'
import type { TextBackup } from '../domain/backup'
import '../styles.css'

const otherDatabases: Dexie[] = []
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
  for (const database of otherDatabases) database.close()
  await Promise.all(otherDatabases.map(database => Dexie.delete(database.name)))
  otherDatabases.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function populate() {
  const productId = crypto.randomUUID()
  const text: TextBackup = {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
    profile: { id: 'self', name: 'Синтетический прежний профиль', heightCm: 170, birthDate: null, formulaSex: 'none' },
    weights: [{ id: crypto.randomUUID(), date: '2026-10-14', kg: 70 }],
    products: [{ id: productId, name: 'Синтетический продукт', source: '', kcal: 0, protein: null, fat: 0, carbs: null, archived: true }],
    foodEntries: [{ id: crypto.randomUUID(), date: '2026-10-14', meal: 'lunch', productId, grams: 100, snapshot: { name: 'Синтетический снимок', source: '', kcal: 123.5, protein: null, fat: 0, carbs: null }, note: '' }],
    nutritionDays: [{ date: '2026-10-14', complete: false }], steps: [{ date: '2026-10-14', count: 0 }],
    workouts: [{ id: crypto.randomUUID(), date: '2026-10-14', kind: 'Синтетическая прогулка', minutes: 12.5, kcal: null, source: '', note: '' }],
    energyPlans: [{ id: crypto.randomUUID(), revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-14', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70, weightDate: '2026-10-14', heightCm: 170, age: null, formulaSex: 'none' } }],
  }
  await restoreTextBackup(text)
  await db.metadata.put({ id: 'catalog-seeded', value: 'done' })
  await saveVisibility({ version: 1, showPhotos: false, showDocuments: false })
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
  await addPhoto({ date: '2026-10-14', title: 'Синтетическое фото перед удалением', note: '' }, png)
  const documentRecord = await addDocument({ date: '2026-10-13', title: 'Синтетический PDF перед удалением', kind: 'lab', note: '' },
    new Blob(['%PDF-1.7\nsynthetic-deleted-document\n%%EOF\n'], { type: 'application/pdf' }))
  await addLabResult({ documentId: documentRecord.id, date: '2026-10-13', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'lte' }, unit: '', reference: '≤ 0,0000002', note: '' })
  return exportFullBackup()
}

test('подтверждение удаляет весь дневник атомарно, отказ откатывает байты, соседняя база и новый дневник работают', async () => {
  const before = await populate()
  async function expectUnchanged() {
    const after = await exportFullBackup()
    expect({ ...after, text: { ...after.text, exportedAt: before.text.exportedAt } }).toEqual(before)
  }
  const unrelated = new Dexie(`health-diary-test-unrelated-delete-${crypto.randomUUID()}`)
  otherDatabases.push(unrelated)
  unrelated.version(1).stores({ markers: 'id' })
  const marker = { id: 'synthetic-other-database', value: 'Сохранить отдельную базу' }
  await unrelated.table<unknown, string>('markers').put(marker)
  let view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const fullFile = page.getByLabelText('Файл полной копии', { exact: true })
  const fullPreview = page.getByRole('region', { name: 'Предпросмотр полной копии', exact: true })
  const fullConsent = page.getByLabelText('Согласен заменить весь дневник, включая файлы и показатели', { exact: true })
  await fullFile.upload(new File([serializeFullBackup(before)], 'synthetic-before-delete.json', { type: 'application/json' }))
  await page.getByRole('button', { name: 'Проверить полную копию', exact: true }).click()
  await expect.element(fullPreview).toBeVisible()
  await fullConsent.click()
  const section = page.getByRole('region', { name: 'Удаление дневника', exact: true })
  const opener = section.getByRole('button', { name: 'Удалить весь дневник', exact: true })
  const confirmation = page.getByRole('alertdialog')
  const cancel = confirmation.getByRole('button', { name: 'Отмена', exact: true })
  const confirm = confirmation.getByRole('button', { name: 'Подтвердить удаление', exact: true })
  await expect.element(section).toHaveTextContent('Скачанные копии остаются на устройстве')
  await opener.click()
  await expect.element(confirmation).toHaveTextContent('Удалить все данные дневника, включая фото, документы, показатели и настройки? Без резервной копии восстановить их не получится.')
  await expect.element(cancel).toHaveFocus()
  await expectUnchanged()
  expect((await axe.run(view.container)).violations).toEqual([])
  await userEvent.keyboard('{Enter}')
  await expect.element(confirmation).not.toBeInTheDocument()
  await expect.element(opener).toHaveFocus()
  await expect.element(fullPreview).toBeVisible()
  await expect.element(fullConsent).toBeChecked()
  await expectUnchanged()
  await opener.click()
  const deleted = new Set<string>()
  const unsubscribe: (() => void)[] = []
  for (const name of db.tables.map(table => table.name)) {
    const table = db.table<unknown, string>(name)
    const observe = () => { deleted.add(name) }
    table.hook('deleting', observe)
    unsubscribe.push(() => { table.hook('deleting').unsubscribe(observe) })
  }
  const failure = () => { throw new DOMException('synthetic-private-delete-quota', 'QuotaExceededError') }
  db.labResults.hook('deleting', failure)
  let locked = false
  let release = false
  const lock = db.transaction('rw', db.metadata, async () => { locked = true; while (!release) await db.metadata.count() })
  await expect.poll(() => locked).toBe(true)
  try {
    try {
      await confirm.click()
      await expect.element(confirm).toBeDisabled()
      await expect.element(cancel).toBeDisabled()
      await expect.element(opener).toBeDisabled()
      await userEvent.keyboard('{Enter}')
    } finally { release = true; await lock }
    await expect.element(page.getByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
    await expect.element(cancel).toHaveFocus()
    await expect.element(confirmation).toBeVisible()
  } finally {
    db.labResults.hook('deleting').unsubscribe(failure)
    unsubscribe.forEach(remove => { remove() })
  }
  expect(deleted.size).toBe(13)
  expect(view.container.textContent).not.toContain('synthetic-private-delete-quota')
  await expect.element(fullPreview).toBeVisible()
  await expect.element(fullConsent).toBeChecked()
  await expectUnchanged()
  expect(await unrelated.table<unknown, string>('markers').toArray()).toEqual([marker])
  await userEvent.keyboard('{Tab}')
  await expect.element(confirm).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('status').filter({ hasText: 'Все данные дневника удалены' })).toHaveTextContent('Все данные дневника удалены')
  await expect.element(confirmation).not.toBeInTheDocument()
  await expect.element(opener).toHaveFocus()
  await expect.element(fullPreview).not.toBeInTheDocument()
  await expect.element(fullConsent).not.toBeInTheDocument()
  await expect.element(fullFile).toHaveValue('')
  expect(await Promise.all(db.tables.map(table => table.count()))).toEqual(Array<number>(13).fill(0))
  expect(await getVisibility()).toEqual(DEFAULT_VISIBILITY)
  await expect.element(page.getByRole('link', { name: 'Фото', exact: true })).toBeVisible()
  await expect.element(page.getByRole('link', { name: 'Документы', exact: true })).toBeVisible()
  unrelated.close()
  await unrelated.open()
  expect(await unrelated.table<unknown, string>('markers').toArray()).toEqual([marker])
  await view.unmount()
  view = await render(<App />)
  await expect.element(opener).toBeVisible()
  expect(await Promise.all(db.tables.map(table => table.count()))).toEqual(Array<number>(13).fill(0))
  await page.getByRole('link', { name: 'Фото', exact: true }).click()
  await expect.element(page.getByText('Фотографий пока нет.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Документы', exact: true }).click()
  await expect.element(page.getByText('Документов пока нет.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect.element(page.getByRole('form', { name: 'Создание профиля', exact: true })).toBeVisible()
  await page.getByLabelText('Имя (необязательно)', { exact: true }).fill('Синтетический новый дневник')
  await page.getByLabelText('Рост, см', { exact: true }).fill('175')
  await page.getByLabelText('Вес, кг', { exact: true }).fill('72')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect.element(page.getByRole('status').filter({ hasText: 'Профиль и первое измерение сохранены' })).toHaveTextContent('Профиль и первое измерение сохранены')
  expect(await db.profiles.get('self')).toMatchObject({ name: 'Синтетический новый дневник', heightCm: 175 })
  expect(await db.weights.count()).toBe(1)
  expect(await db.files.count()).toBe(0)
  expect(await db.metadata.count()).toBe(0)
  expect(await unrelated.table<unknown, string>('markers').toArray()).toEqual([marker])
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

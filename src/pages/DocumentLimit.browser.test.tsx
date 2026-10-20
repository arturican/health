import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import '../styles.css'

vi.mock('../domain/backup', async importOriginal => ({ ...await importOriginal<typeof import('../domain/backup')>(), BACKUP_MAX_RECORDS: 3 }))

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear() })
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
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
function syntheticPdf(index: number) {
  return new File([`%PDF-1.7\nsynthetic-native-limit-document-${String(index)}\n%%EOF\n`], `synthetic-document-${String(index)}.pdf`, { type: 'application/pdf' })
}

test('лимит вложений сохраняет документы, байты и выбранный файл; удаление освобождает место для повтора', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Документы', exact: true }).click()
  const form = page.getByRole('form', { name: 'Добавление документа', exact: true })
  const title = form.getByLabelText('Название документа', { exact: true })
  const note = form.getByLabelText('Заметка к документу (необязательно)', { exact: true })
  const file = form.getByLabelText('Файл документа', { exact: true })
  const save = form.getByRole('button', { name: 'Добавить документ', exact: true })
  for (const index of [1, 2, 3]) {
    const name = `Синтетический PDF ${String(index)}`
    await title.fill(name)
    await file.upload(syntheticPdf(index))
    await save.click()
    await openAttachment(name)
    await expect.element(page.getByRole('button', { name: `Скачать оригинал: ${name}`, exact: true })).toBeVisible()
    await expect.element(title).toHaveValue('')
  }
  const documentsBefore = await db.documents.toArray()
  const filesBefore = await db.files.toArray()
  expect(documentsBefore).toHaveLength(3)
  expect(filesBefore).toHaveLength(3)
  const fourth = syntheticPdf(4)
  await title.fill('Синтетический PDF 4')
  await note.fill('Синтетический черновик документа после лимита')
  await file.upload(fourth)
  await save.click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Достигнут лимит записей раздела (3). Новые записи не сохранены.')
  await expect.element(title).toHaveValue('Синтетический PDF 4')
  await expect.element(note).toHaveValue('Синтетический черновик документа после лимита')
  const input = file.element()
  if (!(input instanceof HTMLInputElement)) throw new Error('Нужен настоящий file input документа')
  const selected = input.files?.[0]
  if (!selected) throw new Error('Отказ лимита должен сохранить выбранный файл')
  expect([selected.name, selected.type, selected.size]).toEqual([fourth.name, fourth.type, fourth.size])
  expect(new Uint8Array(await selected.arrayBuffer())).toEqual(new Uint8Array(await fourth.arrayBuffer()))
  expect(await db.documents.toArray()).toEqual(documentsBefore)
  const filesAfter = await db.files.toArray()
  expect(filesAfter.map(record => ({ ...record, blob: null }))).toEqual(filesBefore.map(record => ({ ...record, blob: null })))
  for (const stored of filesAfter) {
    const original = filesBefore.find(record => record.id === stored.id)
    if (!original) throw new Error('Отказ не должен добавлять новый Blob')
    expect(new Uint8Array(await stored.blob.arrayBuffer())).toEqual(new Uint8Array(await original.blob.arrayBuffer()))
  }
  const deleted = documentsBefore.find(document => document.title === 'Синтетический PDF 1')
  if (!deleted) throw new Error('Нужен первый синтетический документ')
  const firstCard = page.getByRole('article', { name: 'Синтетический PDF 1, 2026-10-14', exact: true })
  await firstCard.getByRole('button', { name: /^Удалить документ/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect.element(firstCard).not.toBeInTheDocument()
  await expect.element(title).toHaveValue('Синтетический PDF 4')
  await expect.element(note).toHaveValue('Синтетический черновик документа после лимита')
  expect(input.files?.[0]).toBe(selected)
  expect(await db.documents.get(deleted.id)).toBeUndefined()
  expect(await db.files.get(deleted.fileId)).toBeUndefined()
  await save.click()
  await openAttachment('Синтетический PDF 4')
  await expect.element(page.getByRole('button', { name: 'Скачать оригинал: Синтетический PDF 4', exact: true })).toBeVisible()
  await expect.element(title).toHaveValue('')
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  const documents = await db.documents.toArray()
  const files = await db.files.toArray()
  expect(documents).toHaveLength(3)
  expect(files).toHaveLength(3)
  expect(documents.map(document => document.fileId).sort()).toEqual(files.map(record => record.id).sort())
  const fourthDocument = documents.find(document => document.title === 'Синтетический PDF 4')
  const fourthStored = files.find(record => record.id === fourthDocument?.fileId)
  if (!fourthStored) throw new Error('У повторно сохранённого документа должен быть файл')
  expect(new Uint8Array(await fourthStored.blob.arrayBuffer())).toEqual(new Uint8Array(await fourth.arrayBuffer()))
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

async function openAttachment(title: string) {
  const label = 'Открыть вложение: ' + title
  if (!Array.from(document.querySelectorAll('button')).some(button => button.getAttribute('aria-label') === 'Закрыть вложение: ' + title)) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
}

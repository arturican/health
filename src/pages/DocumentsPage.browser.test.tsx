import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import '../styles.css'

const clickObservers: ((event: MouseEvent) => void)[] = []
async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans, db.files, db.photos, db.documents], async () => {
    await db.metadata.clear()
    await db.profiles.clear()
    await db.weights.clear()
    await db.products.clear()
    await db.foodEntries.clear()
    await db.nutritionDays.clear()
    await db.steps.clear()
    await db.workouts.clear()
    await db.energyPlans.clear()
    await db.photos.clear()
    await db.documents.clear()
    await db.files.clear()
  })
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
  for (const observer of clickObservers) document.removeEventListener('click', observer, true)
  clickObservers.length = 0
  await page.viewport(1280, 800)
  vi.useRealTimers()
})
async function syntheticPng() {
  const canvas = document.createElement('canvas')
  canvas.width = 3072
  canvas.height = 1536
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического документа нужен Canvas')
  context.fillStyle = '#ff0000'
  context.fillRect(0, 0, 3072, 1536)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => { if (value) resolve(value); else reject(new Error('Синтетическое изображение не создано')) }, 'image/png')
  })
  return new File([blob], 'synthetic-image.png', { type: 'image/png' })
}
async function expectOriginalImage(title: string, source: Blob) {
  const locator = page.getByRole('img', { name: `Документ: ${title}`, exact: true })
  await expect.element(locator).toBeVisible()
  const image = locator.element()
  if (!(image instanceof HTMLImageElement)) throw new Error('Нужно настоящее изображение документа')
  await image.decode()
  expect([image.naturalWidth, image.naturalHeight]).toEqual([3072, 1536])
  const original = await (await fetch(image.src)).blob()
  expect(original.type).toBe('image/png')
  expect(new Uint8Array(await original.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()))
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для чтения синтетического пикселя нужен Canvas')
  context.drawImage(image, 1536, 768, 1, 1, 0, 0, 1, 1)
  expect(context.getImageData(0, 0, 1, 1).data[0]).toBe(255)
}

test('документы загружаются через форму, ищутся без изменения данных и сохраняются после повторного открытия', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Документы', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 1, name: 'Документы', exact: true })).toBeVisible()
  await expect.element(page.getByText('Документов пока нет.', { exact: true })).toBeVisible()
  expect(window.location.hash).toBe('#documents')
  const date = page.getByLabelText('Дата документа', { exact: true })
  const title = page.getByLabelText('Название документа', { exact: true })
  const kind = page.getByLabelText('Категория документа', { exact: true })
  const note = page.getByLabelText('Заметка к документу (необязательно)', { exact: true })
  const file = page.getByLabelText('Файл документа', { exact: true })
  const save = page.getByRole('button', { name: 'Добавить документ', exact: true })
  const search = page.getByLabelText('Найти документ', { exact: true })
  const list = page.getByRole('list', { name: 'Сохранённые документы', exact: true })
  const pdfTitle = 'Синтетический анализ PDF'
  const pngTitle = 'Синтетический PNG с длинным названием для проверки мобильного списка'
  const pdf = new File(['%PDF-1.7\nsynthetic-uploaded-document\n%%EOF\n'], 'synthetic-document.pdf', { type: 'application/pdf' })
  const png = await syntheticPng()
  await expect.element(kind).toHaveValue('lab')
  await date.fill('2026-10-15')
  await title.fill(pdfTitle)
  await file.upload(pdf)
  await save.click()
  await expect.element(date).toHaveAccessibleDescription('Дата документа не может быть в будущем')
  await expect.element(date).toHaveFocus()
  expect(await db.documents.count()).toBe(0)
  expect(await db.files.count()).toBe(0)
  await date.fill('2026-10-13')
  await file.upload(new File(['<html>synthetic-invalid-document</html>'], 'synthetic-invalid.png', { type: 'image/png' }))
  await save.click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Неподдерживаемый формат вложения')
  await expect.element(file).toHaveAccessibleDescription(/Неподдерживаемый формат вложения/)
  await expect.element(file).toHaveFocus()
  await expect.element(title).toHaveValue(pdfTitle)
  await expect.element(kind).toHaveValue('lab')
  expect(await db.documents.count()).toBe(0)
  expect(await db.files.count()).toBe(0)
  await file.upload(pdf)
  await note.fill('Синтетическая памятка PDF')
  await userEvent.keyboard('{Tab}')
  await expect.element(file).toHaveFocus()
  await userEvent.keyboard('{Tab}')
  await expect.element(save).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('status').filter({ hasText: 'Документ добавлен' })).toHaveTextContent('Документ добавлен')
  await expect.element(title).toHaveFocus()
  await expect.element(title).toHaveValue('')
  await date.fill('2026-10-14')
  await title.fill(pngTitle)
  await kind.selectOptions('imaging')
  await note.fill('Синтетическое описание красного образца')
  await file.upload(png)
  await save.click()
  await expectOriginalImage(pngTitle, png)
  const saved = await db.documents.orderBy('date').reverse().toArray()
  expect(saved.map(document => ({ title: document.title, date: document.date, kind: document.kind }))).toEqual([
    { title: pngTitle, date: '2026-10-14', kind: 'imaging' }, { title: pdfTitle, date: '2026-10-13', kind: 'lab' },
  ])
  expect(Array.from(list.element().querySelectorAll('article time')).map(time => time.getAttribute('datetime'))).toEqual(['2026-10-14', '2026-10-13'])
  const searches: [string, string][] = [['  СИНТЕТИЧЕСКИЙ АНАЛИЗ PDF  ', pdfTitle], ['  СИНТЕТИЧЕСКАЯ ПАМЯТКА PDF  ', pdfTitle], ['  АНАЛИЗ  ', pdfTitle], ['2026-10-14', pngTitle]]
  for (const [query, expected] of searches) {
    await search.fill(query)
    await expect.element(list.getByRole('heading', { level: 3, name: expected, exact: true })).toBeVisible()
    expect(list.element().querySelectorAll('article')).toHaveLength(1)
    expect(await db.documents.orderBy('date').reverse().toArray()).toEqual(saved)
    expect(await db.files.count()).toBe(2)
  }
  await search.fill('Несуществующий синтетический запрос')
  await expect.element(page.getByText('По запросу ничего не найдено.', { exact: true })).toBeVisible()
  await search.fill('')
  const downloads: { href: string; name: string; response: Promise<Response> }[] = []
  const observer = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLAnchorElement) || !target.download) return
    downloads.push({ href: target.href, name: target.download, response: fetch(target.href) })
    event.preventDefault()
  }
  clickObservers.push(observer)
  document.addEventListener('click', observer, true)
  await list.getByRole('button', { name: `Скачать оригинал: ${pdfTitle}`, exact: true }).click()
  await expect.element(page.getByRole('status').filter({ hasText: 'Скачивание оригинала начато' })).toHaveTextContent('Скачивание оригинала начато')
  const download = downloads[0]
  const pdfRecord = saved.find(document => document.kind === 'lab')
  if (!download || !pdfRecord) throw new Error('Синтетический PDF должен скачаться')
  expect(download.name).toBe(`health-document-${pdfRecord.fileId}.pdf`)
  expect(new Uint8Array(await (await download.response).arrayBuffer())).toEqual(new Uint8Array(await pdf.arrayBuffer()))
  await expect(fetch(download.href)).rejects.toThrow()
  expect(view.container.querySelector('iframe, object, embed')).toBeNull()
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(search).toHaveValue('')
  await expect.element(list.getByRole('heading', { level: 3, name: pdfTitle, exact: true })).toBeVisible()
  await expectOriginalImage(pngTitle, png)
  expect(await db.documents.orderBy('date').reverse().toArray()).toEqual(saved)
  expect(await db.files.count()).toBe(2)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

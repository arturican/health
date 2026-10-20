import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import { db } from '../data/db'
import { addDocument } from '../data/documentRepository'
import { prepareFile, savePreparedFile } from '../data/fileRepository'
import { DocumentFile } from './DocumentFile'
import '../styles.css'

const objectUrls = new Set<string>()
const clickObservers: ((event: MouseEvent) => void)[] = []
async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.documents, db.files, async () => {
    await db.documents.clear()
    await db.files.clear()
  })
}
beforeEach(async () => {
  await resetTestState()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  await resetTestState()
  for (const observer of clickObservers) document.removeEventListener('click', observer, true)
  clickObservers.length = 0
  vi.restoreAllMocks()
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
  vi.useRealTimers()
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
function observeUrls() {
  const realCreate = URL.createObjectURL.bind(URL)
  const realRevoke = URL.revokeObjectURL.bind(URL)
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    const url = realCreate(blob)
    objectUrls.add(url)
    return url
  })
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { realRevoke(url); objectUrls.delete(url) })
  return { create, revoke }
}
async function syntheticPng() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического документа нужен Canvas')
  context.fillStyle = '#ff0000'
  context.fillRect(0, 0, 64, 32)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетическое изображение не создано')) }, 'image/png')
  })
}

test('PDF скачивается явной кнопкой как локальные исходные байты, ссылка и URL освобождаются', async () => {
  const source = new File(['%PDF-1.7\nsynthetic-original-document\n%%EOF\n'], 'synthetic-original.pdf', { type: '' })
  const entry = await addDocument({ date: '2026-10-14', title: 'Синтетический PDF', kind: 'report', note: '' }, source)
  const downloads: { href: string; filename: string; attached: boolean; response: Promise<Response> }[] = []
  const observer = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLAnchorElement) || !target.download) return
    downloads.push({ href: target.href, filename: target.download, attached: target.isConnected, response: fetch(target.href) })
    event.preventDefault()
  }
  clickObservers.push(observer)
  document.addEventListener('click', observer, true)
  const { create, revoke } = observeUrls()
  const view = await render(<main><h1>Документы</h1><DocumentFile fileId={entry.fileId} title={entry.title} /></main>)
  await openAttachment(entry.title)
  await expect.element(page.getByText('PDF доступен для скачивания. Откройте его в своей программе просмотра.', { exact: true })).toBeVisible()
  expect(view.container.querySelector('iframe, object, embed')).toBeNull()
  await expect.element(page.getByRole('img')).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled()
  const button = page.getByRole('button', { name: `Скачать оригинал: ${entry.title}`, exact: true })
  await button.click()
  await expect.element(page.getByRole('status').filter({ hasText: 'Скачивание оригинала начато' })).toHaveTextContent('Скачивание оригинала начато')
  await expect.element(button).toBeEnabled()
  expect(downloads).toHaveLength(1)
  const download = downloads[0]
  if (!download) throw new Error('Кнопка должна нажать настоящую ссылку скачивания')
  expect(download.filename).toBe(`health-document-${entry.fileId}.pdf`)
  expect(download.href.startsWith('blob:')).toBe(true)
  expect(download.attached).toBe(true)
  const response = await download.response
  expect(response.headers.get('Content-Type')).toBe('application/pdf')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()))
  expect(create).toHaveBeenCalledTimes(1)
  expect(revoke).toHaveBeenCalledExactlyOnceWith(download.href)
  expect(document.querySelector('a[download]')).toBeNull()
  await expect(fetch(download.href)).rejects.toThrow()
  expect(view.container.querySelector('iframe, object, embed')).toBeNull()
  expect(await db.documents.toArray()).toEqual([entry])
})

test('PNG документа декодируется, смена fileId скрывает старое изображение и ошибки не раскрывают детали', async () => {
  const source = await syntheticPng()
  const entry = await addDocument({ date: '2026-10-14', title: 'Синтетическая красная геометрия', kind: 'imaging', note: '' }, source)
  const photoFile = await prepareFile(source, 'photo')
  await savePreparedFile(photoFile)
  const { create, revoke } = observeUrls()
  const view = await render(<main><h1>Документы</h1><DocumentFile fileId={entry.fileId} title={entry.title} /></main>)
  await openAttachment(entry.title)
  const locator = page.getByRole('img', { name: `Документ: ${entry.title}`, exact: true })
  await expect.element(locator).toBeVisible()
  const image = locator.element()
  if (!(image instanceof HTMLImageElement)) throw new Error('Нужно настоящее изображение документа')
  await image.decode()
  expect([image.naturalWidth, image.naturalHeight]).toEqual([64, 32])
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для чтения синтетического пикселя нужен Canvas')
  context.drawImage(image, 32, 16, 1, 1, 0, 0, 1, 1)
  expect(context.getImageData(0, 0, 1, 1).data[0]).toBe(255)
  const url = image.src
  const original = await (await fetch(url)).blob()
  expect(original.type).toBe('image/png')
  expect(new Uint8Array(await original.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()))
  expect(create).toHaveBeenCalledTimes(1)
  await view.rerender(<main><h1>Документы</h1><DocumentFile fileId="00000000-0000-4000-8000-000000000099" title="Другой документ" /></main>)
  await openAttachment('Другой документ')
  await expect.element(page.getByRole('alert')).toHaveTextContent(/^Не удалось открыть вложение документа\.$/)
  await expect.element(locator).not.toBeInTheDocument()
  expect(revoke).toHaveBeenCalledExactlyOnceWith(url)
  await expect(fetch(url)).rejects.toThrow()
  await view.rerender(<main><h1>Документы</h1><DocumentFile fileId={photoFile.id} title="Другой документ" /></main>)
  await openAttachment('Другой документ')
  await expect.element(page.getByRole('alert')).toHaveTextContent(/^Не удалось открыть вложение документа\.$/)
  await expect.element(page.getByRole('img')).not.toBeInTheDocument()
  await expect.element(page.getByRole('button', { name: /Скачать оригинал/ })).not.toBeInTheDocument()
  expect(create).toHaveBeenCalledTimes(1)
  expect(view.container.querySelector('iframe, object, embed')).toBeNull()
})

async function openAttachment(title: string) {
  const label = 'Открыть вложение: ' + title
  if (!Array.from(document.querySelectorAll('button')).some(button => button.getAttribute('aria-label') === 'Закрыть вложение: ' + title)) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
}

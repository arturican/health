import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import { db } from '../data/db'
import { addPhoto } from '../data/photoRepository'
import { FileImage } from './FileImage'

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.photos, db.files, async () => {
    await db.photos.clear()
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
  vi.restoreAllMocks()
  vi.useRealTimers()
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})

async function syntheticImage(width: number, height: number, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического изображения нужен Canvas')
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетическое изображение не создано')) }, 'image/png')
  })
}

function observeObjectUrls() {
  const originalCreate = URL.createObjectURL.bind(URL)
  const originalRevoke = URL.revokeObjectURL.bind(URL)
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => originalCreate(blob))
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { originalRevoke(url) })
  return { create, revoke }
}

async function decodedImage(alt: string, width: number, height: number, color: readonly number[]) {
  const locator = page.getByRole('img', { name: alt, exact: true })
  await expect.element(locator).toBeVisible()
  const image = locator.element()
  if (!(image instanceof HTMLImageElement)) throw new Error('Ожидалось настоящее изображение')
  await image.decode()
  expect([image.naturalWidth, image.naturalHeight]).toEqual([width, height])
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для чтения синтетических пикселей нужен Canvas')
  context.drawImage(image, 0, 0)
  const pixel = context.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data
  color.forEach((channel, index) => { expect(Math.abs((pixel[index] ?? -1) - channel)).toBeLessThan(10) })
  expect(pixel[3]).toBe(255)
  return image
}

test('настоящие сохранённые фото декодируются, смена fileId и unmount освобождают каждый object URL', async () => {
  const first = await addPhoto({ date: '2026-10-13', title: 'Синтетический красный образец', note: '' }, await syntheticImage(64, 32, '#ff0000'))
  const second = await addPhoto({ date: '2026-10-14', title: 'Синтетический синий образец', note: '' }, await syntheticImage(32, 64, '#0000ff'))
  const { create, revoke } = observeObjectUrls()
  const view = await render(<FileImage fileId={first.fileId} alt={first.title} width={first.width} height={first.height} />)
  const firstImage = await decodedImage(first.title, first.width, first.height, [255, 0, 0])
  const firstUrl = firstImage.src
  expect(firstUrl.startsWith('blob:')).toBe(true)
  expect(create).toHaveBeenCalledTimes(1)
  expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
  expect(create.mock.results[0]?.value).toBe(firstUrl)
  expect(revoke).not.toHaveBeenCalled()
  expect((await (await fetch(firstUrl)).blob()).type).toBe('image/jpeg')

  await view.rerender(<FileImage fileId={second.fileId} alt={second.title} width={second.width} height={second.height} />)
  await expect.element(page.getByRole('img', { name: first.title, exact: true })).not.toBeInTheDocument()
  const secondImage = await decodedImage(second.title, second.width, second.height, [0, 0, 255])
  const secondUrl = secondImage.src
  expect(secondUrl).not.toBe(firstUrl)
  expect(create).toHaveBeenCalledTimes(2)
  expect(create.mock.results[1]?.value).toBe(secondUrl)
  expect(revoke.mock.calls).toEqual([[firstUrl]])
  await expect(fetch(firstUrl)).rejects.toBeInstanceOf(TypeError)
  expect((await (await fetch(secondUrl)).blob()).type).toBe('image/jpeg')

  await view.unmount()
  expect(revoke.mock.calls).toEqual([[firstUrl], [secondUrl]])
  await expect(fetch(secondUrl)).rejects.toBeInstanceOf(TypeError)
  expect(await db.photos.count()).toBe(2)
  expect(await db.files.count()).toBe(2)
})

test('отсутствующий файл, повреждённые байты и ошибка декодера показывают только общие сообщения', async () => {
  const missingId = '00000000-0000-4000-8000-000000000001'
  const corruptId = '00000000-0000-4000-8000-000000000002'
  const undecodableId = '00000000-0000-4000-8000-000000000003'
  const privateText = 'Синтетическое приватное содержимое, которое не должно попасть в сообщение'
  const corrupt = new Blob([privateText], { type: 'image/jpeg' })
  const undecodable = new Blob([new Uint8Array([255, 216, 255, 224, 0, 4, 83, 89, 255, 217])], { type: 'image/jpeg' })
  await db.files.bulkAdd([
    { id: corruptId, purpose: 'photo', mime: 'image/jpeg', size: corrupt.size, blob: corrupt },
    { id: undecodableId, purpose: 'photo', mime: 'image/jpeg', size: undecodable.size, blob: undecodable },
  ])
  const { create, revoke } = observeObjectUrls()
  const view = await render(<FileImage fileId={missingId} alt="Синтетический образец" />)
  await expect.element(page.getByRole('alert')).toHaveTextContent(/^Не удалось открыть файл изображения\.$/)
  expect(create).not.toHaveBeenCalled()
  await view.rerender(<FileImage fileId={corruptId} alt="Синтетический образец" />)
  await expect.element(page.getByRole('alert')).toHaveTextContent(/^Не удалось открыть файл изображения\.$/)
  expect(create).not.toHaveBeenCalled()
  expect(view.container.textContent).not.toContain(privateText)
  expect(view.container.textContent).not.toContain(corruptId)
  await expect.element(page.getByRole('img')).not.toBeInTheDocument()

  await view.rerender(<FileImage fileId={undecodableId} alt="Синтетический образец" />)
  await expect.element(page.getByRole('alert')).toHaveTextContent(/^Не удалось показать изображение\.$/)
  expect(create).toHaveBeenCalledTimes(1)
  await expect.element(page.getByRole('img')).not.toBeInTheDocument()
  expect(revoke).not.toHaveBeenCalled()
  await view.unmount()
  expect(revoke.mock.calls).toEqual([[create.mock.results[0]?.value]])
  expect(view.container.textContent).not.toContain(privateText)
})

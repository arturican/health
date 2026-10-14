import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { db } from '../data/db'
import { addPhoto, deletePhoto } from '../data/photoRepository'
import { PhotoComparison } from './PhotoComparison'
import '../styles.css'

const objectUrls = new Set<string>()
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
  await page.viewport(375, 812)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  await resetTestState()
  vi.restoreAllMocks()
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
  await page.viewport(1280, 800)
  vi.useRealTimers()
})
async function syntheticImage(width: number, height: number, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического фото нужен Canvas')
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетическое фото не создано')) }, 'image/png')
  })
}
async function expectImage(alt: string, width: number, height: number, color: number) {
  const locator = page.getByRole('img', { name: alt, exact: true })
  await expect.element(locator).toBeVisible()
  const image = locator.element()
  if (!(image instanceof HTMLImageElement)) throw new Error('Сравнение должно показать настоящее изображение')
  await image.decode()
  expect([image.naturalWidth, image.naturalHeight]).toEqual([width, height])
  const bounds = image.getBoundingClientRect()
  expect(bounds.width / bounds.height).toBeCloseTo(width / height, 3)
  expect(getComputedStyle(image).objectFit).toBe('contain')
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для чтения синтетического пикселя нужен Canvas')
  context.drawImage(image, Math.floor(width / 2), Math.floor(height / 2), 1, 1, 0, 0, 1, 1)
  expect(context.getImageData(0, 0, 1, 1).data[color]).toBeGreaterThan(240)
  return image.src
}

test('сравнение выбирает фото клавиатурой, сохраняет пропорции и освобождает URL при замене и удалении', async () => {
  const red = await addPhoto({ date: '2026-10-14', title: 'Синтетический красный пейзаж', note: '' }, await syntheticImage(128, 64, '#ff0000'))
  const blue = await addPhoto({ date: '2026-10-13', title: 'Синтетическая синяя геометрия', note: '' }, await syntheticImage(64, 128, '#0000ff'))
  const realCreate = URL.createObjectURL.bind(URL)
  const realRevoke = URL.revokeObjectURL.bind(URL)
  const created: string[] = []
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    const url = realCreate(blob)
    created.push(url)
    objectUrls.add(url)
    return url
  })
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { realRevoke(url); objectUrls.delete(url) })
  const view = await render(<main><h1>Фото</h1><PhotoComparison /></main>)
  const first = page.getByLabelText('Первое фото', { exact: true })
  const second = page.getByLabelText('Второе фото', { exact: true })
  await expect.element(first).toBeVisible()
  await userEvent.keyboard('{Tab}')
  await expect.element(first).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}')
  await expect.element(first).toHaveValue(red.id)
  await userEvent.keyboard('{Tab}')
  await expect.element(second).toHaveFocus()
  await userEvent.keyboard('{End}')
  await expect.element(second).toHaveValue(blue.id)
  const redUrl = await expectImage(`Первое фото: ${red.title}`, 128, 64, 0)
  const blueUrl = await expectImage(`Второе фото: ${blue.title}`, 64, 128, 2)
  await expect.element(page.getByRole('figure', { name: 'Первое выбранное фото', exact: true }).getByText(`${red.date} — ${red.title}`, { exact: true })).toBeVisible()
  await expect.element(page.getByRole('figure', { name: 'Второе выбранное фото', exact: true }).getByText(`${blue.date} — ${blue.title}`, { exact: true })).toBeVisible()
  expect(create).toHaveBeenCalledTimes(2)
  expect(revoke).not.toHaveBeenCalled()
  expect((await axe.run(view.container)).violations).toEqual([])

  await first.selectOptions(blue.id)
  await expect.element(page.getByRole('alert')).toHaveTextContent('Выберите два разных фото для сравнения.')
  await expect.element(second).toHaveAccessibleDescription('Выберите два разных фото для сравнения.')
  await expect.element(page.getByRole('img')).not.toBeInTheDocument()
  expect(revoke).toHaveBeenCalledTimes(2)
  expect(revoke).toHaveBeenCalledWith(redUrl)
  expect(revoke).toHaveBeenCalledWith(blueUrl)
  await expect(fetch(redUrl)).rejects.toThrow()
  await expect(fetch(blueUrl)).rejects.toThrow()
  await second.selectOptions(red.id)
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  const swappedBlue = await expectImage(`Первое фото: ${blue.title}`, 64, 128, 2)
  const swappedRed = await expectImage(`Второе фото: ${red.title}`, 128, 64, 0)
  expect(swappedBlue).not.toBe(blueUrl)
  expect(swappedRed).not.toBe(redUrl)
  expect(create).toHaveBeenCalledTimes(4)
  await deletePhoto(red.id)
  await expect.element(page.getByRole('img', { name: `Второе фото: ${red.title}`, exact: true })).not.toBeInTheDocument()
  await expect.element(page.getByText('Второе фото больше недоступно. Выберите другое.', { exact: true })).toBeVisible()
  await expect.element(second).toHaveValue(red.id)
  expect(revoke).toHaveBeenCalledWith(swappedRed)
  await expect(fetch(swappedRed)).rejects.toThrow()
  await expectImage(`Первое фото: ${blue.title}`, 64, 128, 2)
  expect(await db.photos.toArray()).toEqual([blue])
  expect((await db.files.toArray()).map(file => file.id)).toEqual([blue.fileId])
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
  await view.unmount()
  for (const url of created) {
    expect(revoke.mock.calls.filter(([value]) => value === url)).toHaveLength(1)
    await expect(fetch(url)).rejects.toThrow()
  }
  expect(objectUrls.size).toBe(0)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

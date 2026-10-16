import { z } from 'zod'
import { photoSchema } from '../../src/domain/photo'
import { expect, test, type Locator, type Page } from './fixtures'

test.use({ timezoneId: 'Europe/Moscow' })

async function syntheticPng(page: Page, width: number, height: number, color: string) {
  const encoded = await page.evaluate(({ width, height, color }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Для синтетического фото нужен Canvas')
    context.fillStyle = color
    context.fillRect(0, 0, width, height)
    return canvas.toDataURL('image/png').split(',')[1]
  }, { width, height, color })
  if (!encoded) throw new Error('Синтетический PNG не создан')
  return Buffer.from(encoded, 'base64')
}

async function expectImage(image: Locator, width: number, height: number, channel: number) {
  await expect(image).toBeVisible()
  const decoded = await image.evaluate(async image => {
    if (!(image instanceof HTMLImageElement)) throw new Error('Ожидалось настоящее изображение')
    await image.decode()
    const bounds = image.getBoundingClientRect()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Для синтетического пикселя нужен Canvas')
    context.drawImage(image, Math.floor(image.naturalWidth / 2), Math.floor(image.naturalHeight / 2), 1, 1, 0, 0, 1, 1)
    const blob = await (await fetch(image.currentSrc)).blob()
    return {
      width: image.naturalWidth, height: image.naturalHeight, ratio: bounds.width / bounds.height,
      fit: getComputedStyle(image).objectFit, pixel: Array.from(context.getImageData(0, 0, 1, 1).data),
      mime: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    }
  })
  expect([decoded.width, decoded.height]).toEqual([width, height])
  expect(decoded.ratio).toBeCloseTo(width / height, 3)
  expect(decoded.fit).toBe('contain')
  expect(decoded.pixel[channel]).toBeGreaterThan(240)
  expect(decoded.pixel[3]).toBe(255)
  expect(decoded.mime).toBe('image/jpeg')
  return decoded.bytes
}

test('геометрические фото сравниваются, правки сохраняют JPEG, удаление выбранного кадра восстанавливает выбор', async ({ page, baseURL }) => {
  const errors: string[] = []
  const deletedResources = new Set<string>()
  const external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => {
    if (message.type() !== 'error') return
    // In-flight reads of the exact resource just deleted may finish with 404.
    if (deletedResources.has(message.location().url) && message.text() === 'Failed to load resource: the server responded with a status of 404 (Not Found)') return
    errors.push(message.text())
  })
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) external.push(request.url())
  })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#photos')
  await expect(page.getByRole('heading', { level: 1, name: 'Фото', exact: true })).toBeVisible()
  await expect(page.getByText('Фотографий пока нет.', { exact: true })).toBeVisible()
  const red = { date: '2026-10-14', title: 'Синтетический красный пейзаж', note: 'Геометрический красный образец', width: 3072, height: 1536, color: '#ff0000' }
  const blue = { date: '2026-10-13', title: 'Синтетический синий портретный прямоугольник', note: 'Геометрический синий образец', width: 320, height: 640, color: '#0000ff' }
  const add = page.getByRole('form', { name: 'Добавление фото', exact: true })
  const gallery = page.getByRole('list', { name: 'Фотографии по датам', exact: true })
  const files = new Map<string, string>()
  for (const photo of [red, blue]) {
    await add.getByLabel('Дата фото', { exact: true }).fill(photo.date)
    await add.getByLabel('Подпись фото', { exact: true }).fill(photo.title)
    await add.getByLabel('Заметка к фото (необязательно)', { exact: true }).fill(photo.note)
    await add.getByLabel('Файл фото', { exact: true }).setInputFiles({
      name: 'synthetic-geometry.png', mimeType: 'image/png', buffer: await syntheticPng(page, photo.width, photo.height, photo.color),
    })
    const created = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/photos')
    await add.getByRole('button', { name: 'Добавить фото', exact: true }).click()
    const raw: unknown = await (await created).json()
    files.set(photo.title, z.object({ value: photoSchema }).parse(raw).value.fileId)
    await expect(gallery.getByRole('article', { name: `${photo.title}, ${photo.date}`, exact: true })).toContainText(photo.note)
    await expect(add.getByLabel('Подпись фото', { exact: true })).toHaveValue('')
  }
  await expect(gallery.getByRole('listitem')).toHaveCount(2)
  const comparison = page.getByRole('region', { name: 'Сравнение фото', exact: true })
  const first = comparison.getByLabel('Первое фото', { exact: true })
  const second = comparison.getByLabel('Второе фото', { exact: true })
  await first.selectOption({ label: `${red.date} — ${red.title}` })
  await second.selectOption({ label: `${blue.date} — ${blue.title}` })
  const originalBytes = await expectImage(comparison.getByRole('img', { name: `Первое фото: ${red.title}`, exact: true }), 2048, 1024, 0)
  await expectImage(comparison.getByRole('img', { name: `Второе фото: ${blue.title}`, exact: true }), 320, 640, 2)
  await expect(comparison.getByRole('figure', { name: 'Первое выбранное фото', exact: true })).toContainText(`${red.date} — ${red.title}`)
  await expect(comparison.getByRole('figure', { name: 'Второе выбранное фото', exact: true })).toContainText(`${blue.date} — ${blue.title}`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await second.selectOption({ label: `${red.date} — ${red.title}` })
  await expect(comparison.getByRole('alert')).toHaveText('Выберите два разных фото для сравнения.')
  await expect(second).toHaveAccessibleDescription('Выберите два разных фото для сравнения.')
  await expect(comparison.getByRole('img')).toHaveCount(0)
  await second.selectOption({ label: `${blue.date} — ${blue.title}` })
  await expect(comparison.getByRole('alert')).toHaveCount(0)

  const edit = page.getByRole('form', { name: 'Редактирование фото', exact: true })
  const editButton = gallery.getByRole('button', { name: `Изменить фото 1: ${red.title}`, exact: true })
  await editButton.click()
  await expect(edit.getByLabel('Дата фото', { exact: true })).toBeFocused()
  await expect(edit.getByLabel('Заметка к фото (необязательно)', { exact: true })).toHaveValue(red.note)
  await expect(edit.getByLabel('Файл фото', { exact: true })).toHaveCount(0)
  await edit.getByLabel('Подпись фото', { exact: true }).fill('Несохранённая синтетическая правка')
  await edit.getByRole('button', { name: 'Отменить правку фото', exact: true }).click()
  await expect(add.getByLabel('Подпись фото', { exact: true })).toBeFocused()
  await expect(gallery.getByRole('article', { name: `${red.title}, ${red.date}`, exact: true })).toContainText(red.note)
  const updated = { date: '2026-10-12', title: 'Обновлённый синтетический красный пейзаж', note: 'Новая синтетическая заметка без изменения пикселей' }
  await editButton.click()
  await edit.getByLabel('Дата фото', { exact: true }).fill(updated.date)
  await edit.getByLabel('Подпись фото', { exact: true }).fill(updated.title)
  await edit.getByLabel('Заметка к фото (необязательно)', { exact: true }).fill(updated.note)
  await page.keyboard.press('Tab')
  await expect(edit.getByRole('button', { name: 'Сохранить фото', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Фото обновлено' })).toBeVisible()
  const updatedCard = gallery.getByRole('article', { name: `${updated.title}, ${updated.date}`, exact: true })
  await expect(updatedCard).toContainText(updated.note)
  await expect(comparison.getByRole('figure', { name: 'Первое выбранное фото', exact: true })).toContainText(`${updated.date} — ${updated.title}`)
  expect(await expectImage(comparison.getByRole('img', { name: `Первое фото: ${updated.title}`, exact: true }), 2048, 1024, 0)).toEqual(originalBytes)
  await page.reload()
  await expect(updatedCard).toContainText(updated.note)
  expect(await expectImage(updatedCard.getByRole('img', { name: updated.title, exact: true }), 2048, 1024, 0)).toEqual(originalBytes)
  await first.selectOption({ label: `${updated.date} — ${updated.title}` })
  await second.selectOption({ label: `${blue.date} — ${blue.title}` })
  await expectImage(comparison.getByRole('img', { name: `Первое фото: ${updated.title}`, exact: true }), 2048, 1024, 0)

  const remove = updatedCard.getByRole('button', { name: `Удалить фото 2: ${updated.title}`, exact: true })
  const dialog = page.getByRole('alertdialog', { name: `Удалить фото «${updated.title}» за ${updated.date} и его файл?`, exact: true })
  await remove.click()
  await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
  await expect(add.getByLabel('Подпись фото', { exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(remove).toBeFocused()
  await expect(gallery.getByRole('listitem')).toHaveCount(2)
  await expectImage(comparison.getByRole('img', { name: `Первое фото: ${updated.title}`, exact: true }), 2048, 1024, 0)
  await remove.click()
  const removedFile = files.get(red.title)
  if (!removedFile) throw new Error('Нет созданного файла')
  deletedResources.add(new URL('/api/v1/files/' + removedFile, baseURL).href)
  await dialog.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect(gallery.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Галерея фото', exact: true })).toBeFocused()
  await expect(comparison.getByText('Первое фото больше недоступно. Выберите другое.', { exact: true })).toBeVisible()
  await expect(comparison.getByRole('img', { name: `Первое фото: ${updated.title}`, exact: true })).toHaveCount(0)
  await expectImage(comparison.getByRole('img', { name: `Второе фото: ${blue.title}`, exact: true }), 320, 640, 2)
  await second.selectOption('')
  await first.selectOption({ label: `${blue.date} — ${blue.title}` })
  await expectImage(comparison.getByRole('img', { name: `Первое фото: ${blue.title}`, exact: true }), 320, 640, 2)
  await expect(comparison.getByText('Выберите второе фото.', { exact: true })).toBeVisible()
  await expect(comparison.getByText('Для сравнения добавьте минимум две фотографии.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(gallery.getByRole('listitem')).toHaveCount(1)
  await expectImage(gallery.getByRole('img', { name: blue.title, exact: true }), 320, 640, 2)
  await expect(first.getByRole('option', { name: `${updated.date} — ${updated.title}`, exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

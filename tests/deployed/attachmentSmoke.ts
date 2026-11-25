import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, type Page, type BrowserContext, type TestInfo } from '@playwright/test'
import { z } from 'zod'
import { demoPdf } from '../../src/server/demoPdf'

const savedRecord = z.object({ value: z.object({ id: z.uuid(), fileId: z.uuid() }), revision: z.number() })

export async function verifyAttachmentSmoke(page: Page, context: BrowserContext,
  headers: Record<string, string>, date: string, info: TestInfo) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 60
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas недоступен')
    ctx.fillStyle = '#458479'
    ctx.fillRect(0, 0, 80, 60)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  if (!png) throw new Error('Нет синтетического PNG')
  const pdf = demoPdf(date, 145, 4.9)
  for (const item of [
    { route: 'photos', section: 'Фото', form: 'Добавление фото', titleLabel: 'Подпись фото',
      fileLabel: 'Файл фото', action: 'Добавить фото', name: 'synthetic-geometry.png',
      mime: 'image/png', bytes: Buffer.from(png, 'base64') },
    { route: 'documents', section: 'Документы', form: 'Добавление документа', titleLabel: 'Название документа',
      fileLabel: 'Файл документа', action: 'Добавить документ', name: 'synthetic-document.pdf',
      mime: 'application/pdf', bytes: pdf },
  ]) {
    const title = 'Синтетическая приёмка T282 ' + randomUUID()
    let record: z.infer<typeof savedRecord> | undefined
    try {
      await page.getByRole('link', { name: item.section, exact: true }).click()
      const form = page.getByRole('form', { name: item.form, exact: true })
      await form.getByLabel(item.titleLabel, { exact: true }).fill(title)
      await form.getByLabel(item.fileLabel, { exact: true }).setInputFiles({
        name: item.name, mimeType: item.mime, buffer: item.bytes,
      })
      const saving = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/' + item.route
        && response.request().method() === 'POST')
      await form.getByRole('button', { name: item.action, exact: true }).click()
      const response = await saving
      expect(response.status()).toBe(201)
      record = savedRecord.parse(await response.json())
      const filePath = '/api/v1/files/' + record.value.fileId
      await page.reload()
      const stored = await context.request.get(filePath)
      expect(stored.status()).toBe(200)
      if (item.route === 'photos') {
        const image = page.getByRole('img', { name: title, exact: true })
        await expect(image).toBeVisible()
        await expect(image).toHaveJSProperty('naturalWidth', 80)
        await expect(image).toHaveJSProperty('naturalHeight', 60)
        const displayed = await image.evaluate(async (node: HTMLImageElement) => {
          const response = await fetch(node.currentSrc)
          if (!response.ok) throw new Error('Фото недоступно')
          return [...new Uint8Array(await response.arrayBuffer())]
        })
        expect(Buffer.from(displayed)).toEqual(await stored.body())
        const color = await image.evaluate((node: HTMLImageElement) => {
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Canvas недоступен')
          ctx.drawImage(node, 0, 0, 1, 1)
          return [...ctx.getImageData(0, 0, 1, 1).data]
        })
        for (const [channel, expected] of [69, 132, 121].entries()) {
          expect(Math.abs((color[channel] ?? -255) - expected)).toBeLessThanOrEqual(3)
        }
      } else {
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        expect(await stored.body()).toEqual(pdf)
      }
      if (item.route === 'documents') {
        const downloaded = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Открыть вложение: ' + title, exact: true }).click()
        await page.getByRole('button', { name: 'Скачать оригинал: ' + title, exact: true }).click()
        const download = await downloaded
        const path = info.outputPath('synthetic-T282-document.pdf')
        await download.saveAs(path)
        expect(await readFile(path)).toEqual(pdf)
      }
    } finally {
      // The returned UUID identifies only the record created by this iteration.
      if (record) {
        const data = item.route === 'documents'
          ? { revision: record.revision, expectedResults: 0 }
          : { revision: record.revision }
        const removed = await context.request.delete('/api/v1/' + item.route + '/' + record.value.id, {
          headers: { ...headers, 'Idempotency-Key': randomUUID() }, data,
        })
        expect(removed.status()).toBe(204)
        expect((await context.request.get('/api/v1/files/' + record.value.fileId)).status()).toBe(404)
      }
    }
  }
}

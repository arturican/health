import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { readFullBackup } from '../../src/domain/fullBackup'

test.use({ timezoneId: 'Europe/Moscow' })

test('отложенная загрузка документа не возвращает удалённый дневник', async ({ page, baseURL }, info) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) external.push(request.url())
  })
  await page.addInitScript(() => {
    let armed = false
    let released = false
    let release: (() => void) | undefined
    document.addEventListener('synthetic-document-arm', () => { armed = true }, { once: true })
    document.addEventListener('synthetic-document-release', () => {
      released = true
      release?.()
    }, { once: true })
    const blobPrototype: { arrayBuffer: (this: Blob) => Promise<ArrayBuffer> } = Blob.prototype
    const read = blobPrototype.arrayBuffer
    Blob.prototype.arrayBuffer = async function () {
      if (armed) {
        armed = false
        await new Promise<void>(resolve => {
          release = resolve
          document.documentElement.dataset['syntheticRead'] = 'paused'
        })
      }
      return read.call(this)
    }
    const databasePrototype: { transaction: (this: IDBDatabase, stores: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) => IDBTransaction } = IDBDatabase.prototype
    const transact = databasePrototype.transaction
    // Observe settlement of the resumed operation; never replace the transaction or its data.
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const transaction = transact.call(this, stores, mode, options)
      const names = typeof stores === 'string' ? [stores] : Array.from(stores)
      if (released && mode === 'readwrite' && names.includes('documents')) {
        const settled = () => { document.documentElement.dataset['syntheticWrite'] = 'settled' }
        transaction.addEventListener('complete', settled, { once: true })
        transaction.addEventListener('abort', settled, { once: true })
      }
      return transaction
    }
  })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#documents')
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  const form = page.getByRole('form', { name: 'Добавление документа', exact: true })
  const title = 'Синтетический документ до удаления дневника'
  await form.getByLabel('Название документа', { exact: true }).fill(title)
  await form.getByLabel('Файл документа', { exact: true }).setInputFiles({
    name: 'synthetic-delayed-document.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSynthetic delayed document\n%%EOF\n'),
  })
  await page.evaluate(() => { document.dispatchEvent(new Event('synthetic-document-arm')) })
  await form.getByRole('button', { name: 'Добавить документ', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-synthetic-read', 'paused')
  await expect(form.getByRole('button', { name: 'Сохраняем…', exact: true })).toBeDisabled()
  await navigation.getByRole('link', { name: 'Настройки', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить весь дневник', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect(page.getByText('Все данные дневника удалены', { exact: true })).toBeVisible()
  await page.evaluate(() => { document.dispatchEvent(new Event('synthetic-document-release')) })
  await expect(page.locator('html')).toHaveAttribute('data-synthetic-write', 'settled')
  await navigation.getByRole('link', { name: 'Документы', exact: true }).click()
  await expect(page.getByText('Документов пока нет.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Документов пока нет.', { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Настройки', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать полную копию', exact: true }).click()
  const download = await downloading
  const path = info.outputPath('synthetic-after-delayed-document.json')
  await download.saveAs(path)
  expect(await download.failure()).toBeNull()
  const input: unknown = JSON.parse(await readFile(path, 'utf8'))
  const backup = readFullBackup(input)
  expect(backup.text.profile).toBeNull()
  for (const records of [backup.text.weights, backup.text.products, backup.text.foodEntries,
    backup.text.nutritionDays, backup.text.steps, backup.text.workouts, backup.text.energyPlans]) {
    expect(records).toEqual([])
  }
  expect(backup.photos).toEqual([])
  expect(backup.documents).toEqual([])
  expect(backup.files).toEqual([])
  expect(backup.labResults).toEqual([])
  expect(backup.metadata).toEqual([])
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

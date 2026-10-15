import { readFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { decodeBase64 } from '../../src/domain/base64'
import { readFullBackup, type FullBackup } from '../../src/domain/fullBackup'

test.use({ timezoneId: 'Europe/Moscow' })

function counts(backup: FullBackup) {
  return {
    metadata: backup.metadata.length, profile: backup.text.profile ? 1 : 0,
    weights: backup.text.weights.length, products: backup.text.products.length,
    foodEntries: backup.text.foodEntries.length, nutritionDays: backup.text.nutritionDays.length,
    steps: backup.text.steps.length, workouts: backup.text.workouts.length,
    energyPlans: backup.text.energyPlans.length, photos: backup.photos.length,
    documents: backup.documents.length, labResults: backup.labResults.length, files: backup.files.length,
  }
}

async function downloadFull(page: Page, info: TestInfo, name: string) {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать полную копию', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('health-diary-full-2026-10-14.json')
  const path = info.outputPath(name)
  await download.saveAs(path)
  const input: unknown = JSON.parse(await readFile(path, 'utf8'))
  return { path, backup: readFullBackup(input) }
}

test('полная копия восстанавливает все таблицы, связи, скрытые вложения и исходные байты', async ({ page, baseURL }, info) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== baseURL) external.push(url.href)
  })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  const nav = page.getByRole('navigation', { name: 'Разделы дневника' })
  const profileName = 'Синтетический профиль полной копии'
  const productName = 'Синтетический продукт полной копии'
  const photoTitle = 'Геометрический кадр полной копии'
  const documentTitle = 'Синтетический бланк полной копии'
  await page.goto('/#profile')
  await page.getByLabel('Имя (необязательно)').fill(profileName)
  await page.getByLabel('Рост, см').fill('170')
  await page.getByLabel('Вес, кг').fill('70')
  await page.getByRole('button', { name: 'Создать профиль' }).click()
  await expect(page.getByText('Профиль и первое измерение сохранены', { exact: true })).toBeVisible()

  await nav.getByRole('link', { name: 'Питание', exact: true }).click()
  const product = page.getByRole('form', { name: 'Новый продукт', exact: true })
  await product.getByLabel('Название продукта').fill(productName)
  await product.getByLabel('Калории на 100 г, ккал').fill('200')
  await product.getByLabel('Белки на 100 г, г (необязательно)').fill('0')
  await product.getByRole('button', { name: 'Сохранить продукт' }).click()
  await expect(page.getByRole('list', { name: 'Каталог продуктов' }).getByText(productName, { exact: true })).toBeVisible()
  const food = page.getByRole('form', { name: 'Добавление еды', exact: true })
  await food.getByLabel('Продукт для записи').selectOption({ label: productName })
  await food.getByLabel('Приём пищи', { exact: true }).selectOption('lunch')
  await food.getByLabel('Масса порции, г').fill('125')
  await food.getByRole('button', { name: 'Добавить еду' }).click()
  const summary = page.getByRole('region', { name: 'Итоги питания' })
  await expect(summary.getByText('Калории: 250 ккал', { exact: true })).toBeVisible()
  const complete = summary.getByRole('checkbox', { name: 'За этот день внесена вся еда' })
  await complete.click()
  await expect(complete).toBeChecked()

  await nav.getByRole('link', { name: 'Активность', exact: true }).click()
  await page.getByLabel('Шаги за день').fill('0')
  await page.getByRole('button', { name: 'Сохранить шаги', exact: true }).click()
  await expect(page.getByText('Итог шагов сохранён', { exact: true })).toBeVisible()
  const workout = page.getByRole('form', { name: 'Добавление тренировки', exact: true })
  await workout.getByLabel('Вид тренировки').fill('Синтетическая прогулка')
  await workout.getByLabel('Длительность, мин').fill('15')
  await workout.getByRole('button', { name: 'Добавить тренировку', exact: true }).click()
  await expect(page.getByText('Тренировка добавлена', { exact: true })).toBeVisible()

  await nav.getByRole('link', { name: 'Фото', exact: true }).click()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 60
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Не удалось создать синтетический Canvas')
    context.fillStyle = '#d4ebff'
    context.fillRect(0, 0, 80, 60)
    context.fillStyle = '#246'
    context.fillRect(20, 15, 40, 30)
    return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length)
  })
  const photoForm = page.getByRole('form', { name: 'Добавление фото', exact: true })
  await photoForm.getByLabel('Подпись фото').fill(photoTitle)
  await photoForm.getByLabel('Файл фото').setInputFiles({ name: 'synthetic-geometry.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await photoForm.getByRole('button', { name: 'Добавить фото', exact: true }).click()
  await expect(page.getByText('Фото добавлено', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: photoTitle, exact: true })).toBeVisible()

  await nav.getByRole('link', { name: 'Документы', exact: true }).click()
  const pdf = Buffer.from('%PDF-1.7\nSynthetic full backup document\n%%EOF\n', 'utf8')
  const documentForm = page.getByRole('form', { name: 'Добавление документа', exact: true })
  await documentForm.getByLabel('Название документа').fill(documentTitle)
  await documentForm.getByLabel('Файл документа').setInputFiles({ name: 'synthetic-original.pdf', mimeType: 'application/pdf', buffer: pdf })
  await documentForm.getByRole('button', { name: 'Добавить документ', exact: true }).click()
  await expect(page.getByText('Документ добавлен', { exact: true })).toBeVisible()
  await page.getByLabel('Бланк для показателей').selectOption({ label: `2026-10-14 — ${documentTitle}` })
  const lab = page.getByRole('form', { name: 'Добавление показателя', exact: true })
  await lab.getByLabel('Название показателя').fill('Синтетический нулевой показатель')
  await lab.getByLabel('Результат числом').fill('0')
  await lab.getByLabel('Референс как на бланке (необязательно)').fill('Без интерпретации')
  await lab.getByRole('button', { name: 'Добавить показатель', exact: true }).click()
  await expect(page.getByText('Показатель добавлен', { exact: true })).toBeVisible()

  await nav.getByRole('link', { name: 'Настройки', exact: true }).click()
  const plan = page.getByRole('form', { name: 'Новая версия энергетического плана' })
  await plan.getByLabel('Калорийная цель, ккал/сутки (необязательно)').fill('1800')
  await plan.getByLabel('Способ оценки суточного расхода').selectOption('manual')
  await plan.getByLabel('Общая ручная оценка расхода, ккал/сутки').fill('2100')
  await plan.getByRole('button', { name: 'Сохранить новую версию', exact: true }).click()
  await expect(page.getByText('Новая версия плана сохранена', { exact: true })).toBeVisible()
  const privacy = page.getByRole('form', { name: 'Видимость разделов', exact: true })
  await privacy.getByLabel('Показывать фото', { exact: true }).uncheck()
  await privacy.getByLabel('Показывать документы и показатели', { exact: true }).uncheck()
  await privacy.getByRole('button', { name: 'Сохранить видимость', exact: true }).click()
  await expect(page.getByText('Видимость разделов сохранена', { exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Фото', exact: true })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Документы', exact: true })).toHaveCount(0)
  const original = await downloadFull(page, info, 'original-full.json')
  expect(counts(original.backup)).toEqual({ metadata: 1, profile: 1, weights: 1, products: 1, foodEntries: 1, nutritionDays: 1, steps: 1, workouts: 1, energyPlans: 1, photos: 1, documents: 1, labResults: 1, files: 2 })
  const savedPhoto = original.backup.photos[0]
  const savedDocument = original.backup.documents[0]
  const savedProduct = original.backup.text.products[0]
  if (!savedPhoto || !savedDocument || !savedProduct) throw new Error('В полной копии отсутствуют созданные записи')
  expect(original.backup.text.foodEntries[0]?.productId).toBe(savedProduct.id)
  expect(original.backup.labResults[0]?.documentId).toBe(savedDocument.id)
  expect(original.backup.labResults[0]?.value).toEqual({ type: 'number', number: 0, operator: 'eq' })
  expect(original.backup.text.steps[0]?.count).toBe(0)
  expect(original.backup.metadata).toEqual([{ id: 'section-visibility', value: JSON.stringify({ version: 1, showPhotos: false, showDocuments: false }) }])
  const pdfFile = original.backup.files.find(file => file.id === savedDocument.fileId)
  const photoFile = original.backup.files.find(file => file.id === savedPhoto.fileId)
  if (!pdfFile || !photoFile) throw new Error('Нарушены связи вложений')
  expect(pdfFile).toMatchObject({ purpose: 'document', mime: 'application/pdf', size: pdf.length })
  expect(Buffer.from(decodeBase64(pdfFile.base64, pdfFile.size))).toEqual(pdf)
  expect(photoFile).toMatchObject({ purpose: 'photo', mime: 'image/jpeg' })
  expect(savedPhoto).toMatchObject({ width: 80, height: 60 })
  const photoBytes = decodeBase64(photoFile.base64, photoFile.size)
  expect([...photoBytes.slice(0, 2), ...photoBytes.slice(-2)]).toEqual([255, 216, 255, 217])

  await page.getByRole('button', { name: 'Удалить весь дневник', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.reload()
  const cleared = await downloadFull(page, info, 'cleared-full.json')
  expect(Object.values(counts(cleared.backup))).toEqual(Array<number>(13).fill(0))
  await page.getByLabel('Файл полной копии', { exact: true }).setInputFiles(original.path)
  await page.getByRole('button', { name: 'Проверить полную копию', exact: true }).click()
  const preview = page.getByRole('region', { name: 'Предпросмотр полной копии', exact: true })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Фото: 1. Документов: 1. Показателей: 1. Настроек: 1.', { exact: true })).toBeVisible()
  const restore = preview.getByRole('button', { name: 'Восстановить полную копию', exact: true })
  await expect(restore).toBeDisabled()
  await preview.getByRole('checkbox', { name: 'Согласен заменить весь дневник, включая файлы и показатели', exact: true }).check()
  await restore.click()
  await expect(page.getByText('Полная копия восстановлена', { exact: true })).toBeVisible()
  await page.reload()
  await expect(privacy.getByLabel('Показывать фото', { exact: true })).not.toBeChecked()
  await expect(privacy.getByLabel('Показывать документы и показатели', { exact: true })).not.toBeChecked()
  await expect(nav.getByRole('link', { name: 'Фото', exact: true })).toHaveCount(0)
  const restored = await downloadFull(page, info, 'restored-full.json')
  expect({ ...restored.backup, text: { ...restored.backup.text, exportedAt: '' } }).toEqual({ ...original.backup, text: { ...original.backup.text, exportedAt: '' } })

  await privacy.getByLabel('Показывать фото', { exact: true }).check()
  await privacy.getByLabel('Показывать документы и показатели', { exact: true }).check()
  await privacy.getByRole('button', { name: 'Сохранить видимость', exact: true }).click()
  await expect(nav.getByRole('link', { name: 'Фото', exact: true })).toBeVisible()
  await nav.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.getByText(profileName, { exact: true })).toBeVisible()
  await nav.getByRole('link', { name: 'Фото', exact: true }).click()
  const restoredImage = page.getByRole('img', { name: photoTitle, exact: true })
  await expect(restoredImage).toBeVisible()
  await expect(restoredImage).toHaveJSProperty('naturalWidth', 80)
  await nav.getByRole('link', { name: 'Документы', exact: true }).click()
  await page.getByLabel('Бланк для показателей').selectOption(savedDocument.id)
  await expect(page.getByRole('list', { name: 'Показатели выбранного документа' }).getByText('Результат: 0', { exact: true })).toBeVisible()
  const downloadingPdf = page.waitForEvent('download')
  await page.getByRole('button', { name: `Скачать оригинал: ${documentTitle}`, exact: true }).click()
  const downloadedPdf = await downloadingPdf
  expect(downloadedPdf.suggestedFilename()).toBe(`health-document-${savedDocument.fileId}.pdf`)
  const pdfPath = info.outputPath('restored-original.pdf')
  await downloadedPdf.saveAs(pdfPath)
  expect(await readFile(pdfPath)).toEqual(pdf)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

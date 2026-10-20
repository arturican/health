import sharp from 'sharp'
import { expect, test } from './fixtures'
import { verifyRefresh } from '../queryRefresh'

test('вложения, показатели, связанное количество и план ждут свежих ответов', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('70')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Редактировать профиль', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const plan = page.getByRole('form', { name: 'Новая версия энергетического плана' })
  await plan.getByLabel('Калорийная цель, ккал/сутки (необязательно)', { exact: true }).fill('2000')
  const savePlan = plan.getByRole('button', { name: 'Сохранить новую версию', exact: true })
  await verifyRefresh(page, '**/api/v1/energy-plans?**', savePlan, savePlan)
  await expect(plan.getByLabel('Дата начала действия плана', { exact: true })).toBeFocused()

  await page.getByRole('link', { name: 'Фото', exact: true }).click()
  const addPhoto = page.getByRole('form', { name: 'Добавление фото' })
  await addPhoto.getByLabel('Подпись фото', { exact: true }).fill('Учебное фото свежести')
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#346789' } }).png().toBuffer()
  await addPhoto.getByLabel('Файл фото', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png })
  await addPhoto.getByRole('button', { name: 'Добавить фото', exact: true }).click()
  await page.getByRole('button', { name: 'Изменить фото 1: Учебное фото свежести', exact: true }).click()
  const photo = page.getByRole('form', { name: 'Редактирование фото' })
  await photo.getByLabel('Заметка к фото (необязательно)', { exact: true }).fill('Учебная правка')
  await verifyRefresh(page, '**/api/v1/photos?**', photo.getByRole('button', { name: 'Сохранить фото', exact: true }),
    page.getByRole('button', { name: 'Удалить фото 1: Учебное фото свежести', exact: true }))

  await page.getByRole('link', { name: 'Документы', exact: true }).click()
  const addDocument = page.getByRole('form', { name: 'Добавление документа' })
  await addDocument.getByLabel('Название документа', { exact: true }).fill('Учебный документ свежести')
  await addDocument.getByLabel('Файл документа', { exact: true }).setInputFiles({
    name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nsynthetic-source\n%%EOF\n'),
  })
  await addDocument.getByRole('button', { name: 'Добавить документ', exact: true }).click()
  await page.getByRole('button', { name: 'Изменить документ 1: Учебный документ свежести', exact: true }).click()
  const document = page.getByRole('form', { name: 'Редактирование документа' })
  await document.getByLabel('Заметка к документу (необязательно)', { exact: true }).fill('Учебная правка')
  const removeDocument = page.getByRole('button', { name: 'Удалить документ 1: Учебный документ свежести', exact: true })
  await verifyRefresh(page, '**/api/v1/documents?**', document.getByRole('button', { name: 'Сохранить документ', exact: true }),
    [removeDocument, page.getByLabel('Бланк для показателей', { exact: true })])
  await page.getByLabel('Бланк для показателей', { exact: true }).selectOption({ label: '2026-10-14 — Учебный документ свежести' })
  const lab = page.getByRole('form', { name: 'Добавление показателя' })
  await lab.getByLabel('Название показателя', { exact: true }).fill('Учебный показатель свежести')
  await lab.getByLabel('Результат числом', { exact: true }).fill('5')
  await lab.getByRole('button', { name: 'Добавить показатель', exact: true }).click()
  await page.getByRole('button', { name: 'Изменить показатель 1: Учебный показатель свежести', exact: true }).click()
  const labEditor = page.getByRole('form', { name: 'Редактирование показателя' })
  await labEditor.getByLabel('Результат числом', { exact: true }).fill('6')
  await verifyRefresh(page, '**/api/v1/lab-results?**', labEditor.getByRole('button', { name: 'Сохранить показатель', exact: true }),
    page.getByRole('button', { name: 'Удалить показатель 1: Учебный показатель свежести', exact: true }))
  await removeDocument.click()
  const confirm = page.getByRole('button', { name: 'Подтвердить удаление', exact: true })
  await expect(confirm).toBeEnabled()
  await verifyRefresh(page, '**/api/v1/documents/*/results-count', () => page.evaluate(() => { window.dispatchEvent(new Event('focus')) }), confirm)
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  await page.getByLabel('Показывать фото', { exact: true }).uncheck()
  const saveVisibility = page.getByRole('button', { name: 'Сохранить видимость', exact: true })
  await verifyRefresh(page, '**/api/v1/diary-state', saveVisibility, saveVisibility)
  await expect(saveVisibility).toBeFocused()
  await expect(page.getByLabel('Показывать фото', { exact: true })).not.toBeChecked()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const [routeName, title, fileLabel] of [
  ['photos', 'Подпись фото', 'Файл фото'],
  ['documents', 'Название документа', 'Файл документа'],
] as const) {
  test(routeName + ': черновик и выбранный файл переживают отказ видимости и ожидающий повтор', async ({ page }) => {
    const errors: string[] = [], expectedFailures: string[] = []
    const readFailure = 'Error: Не удалось получить данные. Проверьте соединение и повторите действие.'
    page.on('pageerror', error => { errors.push(error.message) })
    page.on('console', message => {
      if (message.type() !== 'error') return
      if (message.text().includes('net::ERR_FAILED') && message.location().url.endsWith('/api/v1/diary-state')) return
      if (message.text().split('\n')[0] === readFailure) expectedFailures.push(message.text())
      else errors.push(message.text())
    })
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
    await page.goto('/#' + routeName)
    const field = page.getByLabel(title, { exact: true })
    const file = page.getByLabel(fileLabel, { exact: true })
    await field.fill('Учебный черновик отказа')
    const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#346789' } }).png().toBuffer()
    await file.setInputFiles({ name: 'synthetic-draft.png', mimeType: 'image/png', buffer: png })
    let fail = true
    let release: () => void = () => { throw new Error('Нет ожидающего повтора') }
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/v1/diary-state', async route => {
      if (fail) { await route.abort('failed'); return }
      await gate
      await route.continue()
    })
    try {
      await page.evaluate(() => { window.dispatchEvent(new Event('online')) })
      await expect(page.getByText('Не удалось обновить видимость разделов. Ваш ввод сохранён.', { exact: true })).toBeVisible()
      await expect(field).toHaveValue('Учебный черновик отказа')
      fail = false
      await page.getByRole('button', { name: 'Повторить загрузку видимости', exact: true }).click()
      await expect(page.getByText('Обновляем настройки видимости…', { exact: true })).toBeVisible()
      await expect(field).toHaveValue('Учебный черновик отказа')
      expect(await file.evaluate(element => element instanceof HTMLInputElement ? element.files?.[0]?.name : null)).toBe('synthetic-draft.png')
      release()
      await expect(page.getByText('Обновляем настройки видимости…', { exact: true })).toHaveCount(0)
      await expect(field).toHaveValue('Учебный черновик отказа')
      expect(await file.evaluate(element => element instanceof HTMLInputElement ? element.files?.[0]?.name : null)).toBe('synthetic-draft.png')
      if (await page.getByRole('heading', { name: 'Раздел недоступен', exact: true }).count()) expect(expectedFailures.length).toBeGreaterThan(0)
      for (const message of expectedFailures) expect(message.split('\n')[0]).toBe(readFailure)
      expect(errors).toEqual([])
    } finally { release(); await page.unroute('**/api/v1/diary-state') }
  })
}

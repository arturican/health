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
  await verifyRefresh(page, '**/api/v1/documents?**', document.getByRole('button', { name: 'Сохранить документ', exact: true }), removeDocument)
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
  await expect(page.getByRole('alert')).toHaveCount(0)
})

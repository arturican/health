import { expect, test } from './fixtures'
import axe from 'axe-core'

declare global {
  interface Window { axe: typeof axe }
}

test('восемь production-экранов доступны с клавиатуры без нарушений axe и переполнения', async ({ page, baseURL }) => {
  test.setTimeout(60000)
  const errors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) externalRequests.push(request.url())
  })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/')
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill('Синтетический аудит доступности')
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('70')
  await page.getByLabel('Дата первого измерения', { exact: true }).fill('2026-10-13')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByText('Синтетический аудит доступности', { exact: true })).toBeVisible()
  await page.evaluate(axe.source)

  const routes = [
    ['today', 'Сегодня'], ['profile', 'Профиль'], ['weight', 'Вес'], ['nutrition', 'Питание'],
    ['activity', 'Активность'], ['photos', 'Фото'], ['documents', 'Документы'], ['settings', 'Настройки'],
  ] as const
  const main = page.getByRole('main')
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  for (const [route, title] of routes) {
    await test.step(title, async () => {
      const link = navigation.getByRole('link', { name: title, exact: true })
      await link.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`#${route}$`))
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      await expect(main).toBeFocused()
      await expect(link).toHaveAttribute('aria-current', 'page')
      await expect(main.getByRole('status').filter({ hasText: /^Загружаем/ })).toHaveCount(0)
      if (route === 'weight') {
        await expect(main.getByRole('img', { name: 'График веса', exact: true })).toBeVisible()
        await expect(main.getByRole('form', { name: 'Новое измерение', exact: true })).toBeVisible()
      }

      const url = page.url()
      await page.getByRole('link', { name: 'Перейти к содержимому', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(url)
      await expect(main).toBeFocused()
      await page.keyboard.press('Tab')
      const firstControl = main.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]').filter({ visible: true }).first()
      await expect(firstControl).toBeFocused()
      await expect(firstControl).toHaveAccessibleName(/\S/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await page.evaluate(async () => (await window.axe.run(document)).violations)).toEqual([])
    })
  }
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})

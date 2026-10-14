import { expect, test } from '@playwright/test'

test('production-экран загружается без ошибок и внешних запросов', async ({ page, baseURL }) => {
  const errors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('request', request => {
    if (new URL(request.url()).origin !== baseURL) externalRequests.push(request.url())
  })

  await page.goto('/')
  await expect(page).toHaveTitle('Дневник здоровья')
  await expect(page.getByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
  await expect(page.getByText(/Ведение записей появится на следующих этапах/)).toBeVisible()

  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflows).toBe(false)
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})

test('клавиатура позволяет пропустить шапку и перейти к будущим возможностям', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Что будет в дневнике' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#plan$/)
  await expect(page.getByRole('region', { name: 'Что будет в дневнике' })).toBeFocused()
})

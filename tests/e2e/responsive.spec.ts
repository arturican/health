import { expect, test, type Page } from '@playwright/test'

test.use({ timezoneId: 'Europe/Moscow' })

function observeBrowser(page: Page, baseURL: string | undefined) {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) external.push(request.url())
  })
  return { errors, external }
}

test('заполненные разделы и длинные значения помещаются на пяти размерах экрана', async ({ page, baseURL }) => {
  test.setTimeout(60000)
  const { errors, external } = observeBrowser(page, baseURL)
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  const main = page.getByRole('main')
  const profileName = `СинтетическийПрофиль${'Имя'.repeat(16)}`
  const documentTitle = `СинтетическийДокумент${'БезПробелов'.repeat(10)}`
  await navigation.getByRole('link', { name: 'Профиль', exact: true }).click()
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill(profileName)
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('70')
  await page.getByLabel('Дата первого измерения', { exact: true }).fill('2026-10-13')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(main.getByText(profileName, { exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Документы', exact: true }).click()
  const form = main.getByRole('form', { name: 'Добавление документа', exact: true })
  await form.getByLabel('Название документа', { exact: true }).fill(documentTitle)
  await form.getByLabel('Файл документа', { exact: true }).setInputFiles({
    name: 'synthetic-responsive-document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nsynthetic-responsive-document\n%%EOF\n'),
  })
  await form.getByRole('button', { name: 'Добавить документ', exact: true }).click()
  await expect(main.getByRole('heading', { level: 3, name: documentTitle, exact: true })).toBeVisible()

  const routes = [
    ['today', 'Сегодня'], ['profile', 'Профиль'], ['weight', 'Вес'], ['nutrition', 'Питание'],
    ['activity', 'Активность'], ['photos', 'Фото'], ['documents', 'Документы'], ['settings', 'Настройки'],
  ] as const
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 812 })
    for (const [route, title] of routes) {
      await test.step(`${String(width)} px — ${title}`, async () => {
        const link = navigation.getByRole('link', { name: title, exact: true })
        await link.click()
        await expect(page).toHaveURL(new RegExp(`#${route}$`))
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
        await expect(main.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
        await expect(link).toHaveAttribute('aria-current', 'page')
        await expect(main).toBeFocused()
        await expect(main.getByRole('status').filter({ hasText: /^Загружаем/ })).toHaveCount(0)
        if (route === 'profile') await expect(main.getByText(profileName, { exact: true })).toBeVisible()
        if (route === 'documents') await expect(main.getByRole('heading', { level: 3, name: documentTitle, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const controls = main.locator('a[href], input, select, textarea, button').or(navigation.getByRole('link')).filter({ visible: true })
        const outside = await controls.evaluateAll(elements => elements.flatMap(element => {
          const bounds = element.getBoundingClientRect()
          return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5
            ? [{ control: element.getAttribute('aria-label') ?? element.getAttribute('name') ?? (element.textContent.trim().slice(0, 80) || element.tagName), left: bounds.left, right: bounds.right }]
            : []
        }))
        expect(outside, 'Все видимые элементы управления помещаются по горизонтали').toEqual([])
      })
    }
  }
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('боковое меню прокручивается на коротком экране и открывает настройки с клавиатуры', async ({ page, baseURL }) => {
  test.setTimeout(60000)
  const { errors, external } = observeBrowser(page, baseURL)
  await page.setViewportSize({ width: 1024, height: 400 })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  await expect(page.getByRole('form', { name: 'Создание профиля', exact: true })).toBeVisible()
  await page.mouse.move(900, 350)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  expect(await navigation.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return bounds.top >= 0 && bounds.bottom <= window.innerHeight
  }), 'Боковое меню целиком находится в пределах высоты экрана').toBe(true)
  const settings = navigation.getByRole('link', { name: 'Настройки', exact: true })
  await settings.scrollIntoViewIfNeeded()
  await expect(settings).toBeInViewport()
  expect(await settings.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const menu = element.closest('nav')?.getBoundingClientRect()
    // Native scroll offsets округляются, а размеры текста могут быть дробными.
    return menu !== undefined && bounds.top >= Math.max(0, menu.top) - 0.5 && bounds.bottom <= Math.min(window.innerHeight, menu.bottom) + 0.5
  }), 'Ссылка целиком видна внутри прокрученного меню и экрана').toBe(true)
  expect(await navigation.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#settings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки', exact: true })).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()
  await expect(settings).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

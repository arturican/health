import { expect, test, type Page } from './fixtures'

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

test('запись веса, отмена и подтверждение доступны на шести точных размерах экрана', async ({ page, baseURL }) => {
  test.setTimeout(60000)
  const { errors, external } = observeBrowser(page, baseURL)
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill('Синтетическая матрица экранов')
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('70')
  await page.getByLabel('Дата первого измерения', { exact: true }).fill('2026-10-13')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByText('Профиль и первое измерение сохранены', { exact: true })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  const main = page.getByRole('main')
  const sizes = [
    { width: 375, height: 812 }, { width: 390, height: 844 },
    { width: 768, height: 1024 }, { width: 1280, height: 800 },
    { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  ]
  for (const [index, size] of sizes.entries()) {
    await page.setViewportSize(size)
    await test.step(`${String(size.width)}×${String(size.height)}`, async () => {
      await navigation.getByRole('link', { name: 'Профиль', exact: true }).click()
      await expect(main.getByRole('heading', { level: 1, name: 'Профиль', exact: true })).toBeVisible()
      await navigation.getByRole('link', { name: 'Вес', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/#weight$/)
      await expect(main).toBeFocused()
      const form = main.getByRole('form', { name: 'Новое измерение' })
      const day = String(index + 1).padStart(2, '0')
      await form.getByLabel('Дата измерения', { exact: true }).fill(`2026-10-${day}`)
      await form.getByLabel('Вес, кг', { exact: true }).fill('71,5')
      await form.getByRole('button', { name: 'Сохранить вес', exact: true }).click()
      const remove = main.getByRole('button', { name: `Удалить вес за ${day}.10.2026`, exact: true })
      await expect(remove).toBeVisible()
      await expect(main.getByRole('list', { name: 'История веса' }).getByText('71,5 кг', { exact: true })).toBeVisible()
      await remove.click()
      await expect(main.getByRole('alertdialog')).toBeVisible()
      await expect(main.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(main.getByRole('alertdialog')).toHaveCount(0)
      await expect(remove).toBeFocused()
      await remove.click()
      await main.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
      await expect(remove).toHaveCount(0)
      await expect(main.getByText('Измерение удалено', { exact: true })).toBeVisible()
      await expect(form.getByLabel('Вес, кг', { exact: true })).toBeFocused()
      await expect(form.getByLabel('Вес, кг', { exact: true })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  }
  await page.reload()
  const history = page.getByRole('list', { name: 'История веса' })
  await expect(history.getByRole('listitem')).toHaveCount(1)
  await expect(history.getByText('70 кг', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('меню не перекрывает карточку аккаунта при прокрутке страницы', async ({ page, baseURL }) => {
  const { errors, external } = observeBrowser(page, baseURL)
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  await expect(page.getByRole('form', { name: 'Создание профиля', exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  const storage = page.getByRole('complementary', { name: 'Хранение дневника', exact: true })
  const sizes = [
    { width: 1024, height: 400 }, { width: 1024, height: 812 },
    { width: 1440, height: 650 }, { width: 1440, height: 900 },
    { width: 1023, height: 812 }, { width: 375, height: 812 },
  ]
  for (const size of sizes) {
    await test.step(`${String(size.width)}×${String(size.height)}`, async () => {
      await page.setViewportSize(size)
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        await page.evaluate(value => { window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value) }, fraction)
        await expect.poll(async () => {
          const menu = await navigation.boundingBox()
          const card = await storage.boundingBox()
          if (!menu || !card) throw new Error('Меню и карточка должны отображаться')
          return card.y - (menu.y + menu.height)
        }, { message: 'Карточка аккаунта остаётся ниже меню при любой прокрутке' }).toBeGreaterThanOrEqual(-0.5)
      }
      const backup = storage.getByRole('link', { name: 'Резервная копия', exact: true })
      const logout = storage.getByRole('button', { name: 'Выйти', exact: true })
      await backup.click({ trial: true })
      await logout.click({ trial: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`sidebar-${String(size.width)}-${String(size.height)}.png`) })
    })
  }
  await storage.getByRole('link', { name: 'Резервная копия', exact: true }).click()
  await expect(page).toHaveURL(/#settings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки', exact: true })).toBeVisible()
  await storage.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Вход в дневник', exact: true })).toBeVisible()
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

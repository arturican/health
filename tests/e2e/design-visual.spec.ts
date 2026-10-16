import { expect, test, type Locator, type Page } from './fixtures'

test.use({ timezoneId: 'Europe/Moscow' })

const observations = new WeakMap<Page, { errors: string[]; external: string[] }>()

async function expectPlotScreenshot(surface: Locator, name: string) {
  await surface.scrollIntoViewIfNeeded()
  const canvas = surface.locator('..')
  const original = await canvas.evaluate(element => {
    if (!(element instanceof HTMLElement)) throw new Error('Область графика должна быть HTML-элементом')
    const bounds = element.getBoundingClientRect()
    const original = { top: element.style.top, left: element.style.left }
    // Дробное положение текста выше графика не должно менять сглаживание его линии.
    element.style.left = `${String(Math.round(bounds.left) - bounds.left)}px`
    element.style.top = `${String(Math.round(bounds.top) - bounds.top)}px`
    return original
  })
  try { await expect(surface).toHaveScreenshot(name) }
  finally {
    await canvas.evaluate((element, saved) => {
      if (element instanceof HTMLElement) {
        element.style.top = saved.top
        element.style.left = saved.left
      }
    }, original)
  }
}

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) external.push(request.url())
  })
  observations.set(page, { errors, external })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/')
})

test.afterEach(({ page }) => {
  const observed = observations.get(page)
  expect(observed?.errors, 'Страница и консоль без ошибок').toEqual([])
  expect(observed?.external, 'Нет внешних HTTP-запросов').toEqual([])
})

test('пиктограммы навигации и бренда сохраняют форму и цвет', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  for (const [name, key] of [
    ['Сегодня', 'today'], ['Профиль', 'profile'], ['Вес', 'weight'], ['Питание', 'nutrition'],
    ['Активность', 'activity'], ['Фото', 'photos'], ['Документы', 'documents'], ['Настройки', 'settings'],
  ] as const) {
    const icon = navigation.getByRole('link', { name, exact: true }).locator('svg')
    await expect(icon).toBeVisible()
    await expect(icon).toHaveScreenshot(`icon-${key}.png`)
  }
  await expect(page.getByRole('banner').locator('svg')).toHaveScreenshot('icon-brand.png')
})

test('график сохраняет круглые точки, линию и выделение на узких экранах', async ({ page }) => {
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill('Синтетический дизайн')
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('72')
  await page.getByLabel('Дата первого измерения', { exact: true }).fill('2026-10-01')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByText('Синтетический дизайн', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Вес', exact: true }).click()

  const chart = page.getByRole('region', { name: 'График веса', exact: true })
  const surface = chart.getByRole('button', { name: 'Выбрать измерение на графике', exact: true })
  const readout = chart.getByRole('status', { name: 'Выбранное измерение', exact: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(readout).toContainText('72 кг')
  await expectPlotScreenshot(surface, 'plot-single-375.png')

  const form = page.getByRole('form', { name: 'Новое измерение', exact: true })
  const measurements = [['2026-10-02', '71,5'], ['2026-10-14', '70']] as const
  for (const [index, [date, kg]] of measurements.entries()) {
    await form.getByLabel('Дата измерения', { exact: true }).fill(date)
    await form.getByLabel('Вес, кг', { exact: true }).fill(kg)
    await form.getByRole('button', { name: 'Сохранить вес', exact: true }).click()
    await expect(page.getByRole('list', { name: 'История веса', exact: true }).getByRole('listitem')).toHaveCount(index + 2)
  }
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 })
    for (const font of ['', 'Arial', 'DejaVu Sans']) {
      await test.step(`${String(width)} px, ${font || 'системный шрифт'}`, async () => {
        const style = font ? await page.addStyleTag({ content: `:root { font-family: "${font}", sans-serif; }` }) : null
        try {
          await chart.getByLabel('Измерение на графике', { exact: true }).selectOption({ label: '14.10.2026 — 70 кг' })
          await expect(readout).toContainText('14.10.2026')
          await chart.getByRole('heading', { name: 'График веса', exact: true }).click()
          await expectPlotScreenshot(surface, `plot-latest-${String(width)}.png`)
          await chart.getByLabel('Измерение на графике', { exact: true }).selectOption({ label: '01.10.2026 — 72 кг' })
          await expect(readout).toContainText('01.10.2026')
          await chart.getByRole('heading', { name: 'График веса', exact: true }).click()
          await expectPlotScreenshot(surface, `plot-first-${String(width)}.png`)
        } finally { await style?.evaluate(element => { element.parentNode?.removeChild(element) }) }
      })
    }
  }
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 })
    // Декоративные точки проверяются внутри доступной области графика без CSS-классов.
    const markers = surface.locator('..').locator(':scope > span[aria-hidden="true"]')
    await expect(markers).toHaveCount(4)
    const distorted = await markers.evaluateAll(elements => elements.flatMap(element => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]
      const rounded = radii.every(corner => corner.split(/\s+/).every(value => value.endsWith('%')
        ? Number.parseFloat(value) >= 50 : Number.parseFloat(value) >= bounds.width / 2))
      return Math.abs(bounds.width - bounds.height) > 0.5 || bounds.width < 6 || !rounded
        ? [{ width: bounds.width, height: bounds.height, radii }] : []
    }))
    expect(distorted, 'Точки остаются круглыми и различимыми при изменении пропорций графика').toEqual([])
    await expect(chart.getByRole('img').locator('polyline')).toHaveCSS('vector-effect', 'non-scaling-stroke')
  }
})

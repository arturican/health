import { expect, test, type Locator, type Page } from '@playwright/test'

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

async function expectTouchTargets(controls: Locator) {
  expect(await controls.count(), 'Проверяется непустой набор основных элементов управления').toBeGreaterThan(0)
  const small = await controls.evaluateAll(elements => elements.flatMap(element => {
    const bounds = element.getBoundingClientRect()
    return bounds.width < 44 || bounds.height < 44 ? [{
      name: element.getAttribute('aria-label') ?? element.getAttribute('name') ?? element.textContent.trim(),
      width: bounds.width,
      height: bounds.height,
    }] : []
  }))
  expect(small, 'Основные цели касания имеют размер не меньше 44×44 CSS px').toEqual([])
}

async function expectVisibleKeyboardFocus(control: Locator) {
  await expect(control).toBeFocused()
  const ring = await control.evaluate(element => {
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), offset: Number.parseFloat(style.outlineOffset), color: style.outlineColor }
  })
  expect(ring.style, 'Клавиатурный фокус имеет видимую обводку').not.toBe('none')
  expect(ring.width).toBeGreaterThanOrEqual(2)
  expect(ring.offset).toBeGreaterThanOrEqual(0)
  expect(ring.color).not.toMatch(/transparent|rgba\([^)]*,\s*0\)/)
}

async function tabToControl(page: Page, control: Locator) {
  // Native date inputs can expose several keyboard segments within one control.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press('Tab')
    if (await control.evaluate(element => element === document.activeElement)) break
  }
  await expectVisibleKeyboardFocus(control)
}

test('основные цели касания и пиктограммы сохраняют размеры на телефоне, планшете и компьютере', async ({ page, baseURL }) => {
  const { errors, external } = observeBrowser(page, baseURL)
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  const form = page.getByRole('form', { name: 'Создание профиля', exact: true })
  await expect(form).toBeVisible()
  await expect(navigation.getByRole('link')).toHaveCount(8)
  for (const width of [320, 768, 1440]) {
    await test.step(`${String(width)} px`, async () => {
      await page.setViewportSize({ width, height: 900 })
      await expectTouchTargets(navigation.getByRole('link'))
      await expectTouchTargets(form.locator('input, select, button'))
      for (const link of await navigation.getByRole('link').all()) {
        const icon = link.locator('svg')
        await expect(icon).toHaveCount(1)
        const geometry = await icon.evaluate(element => {
          const bounds = element.getBoundingClientRect()
          const target = element.parentElement?.getBoundingClientRect()
          return { width: bounds.width, height: bounds.height, inside: target !== undefined && bounds.left >= target.left && bounds.right <= target.right && bounds.top >= target.top && bounds.bottom <= target.bottom }
        })
        expect(geometry.width, 'Пиктограмма остаётся читаемого размера').toBeGreaterThanOrEqual(20)
        expect(Math.abs(geometry.width - geometry.height), 'Пиктограмма не растягивается в овал').toBeLessThan(0.5)
        expect(geometry.inside, 'Пиктограмма целиком помещается в ссылке').toBe(true)
      }
    })
  }
  await navigation.getByRole('link', { name: 'Сегодня', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Сегодня', exact: true })).toBeVisible()
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expectTouchTargets(page.getByRole('form', { name: 'Выбор дня', exact: true }).locator('input, button'))
    await expectTouchTargets(page.getByRole('navigation', { name: 'Быстрые записи', exact: true }).getByRole('link'))
  }
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('переходы клавиатурой показывают фокус на ссылке, поле, select и кнопке', async ({ page, baseURL }) => {
  const { errors, external } = observeBrowser(page, baseURL)
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Разделы дневника', exact: true })
  await navigation.getByRole('link', { name: 'Сегодня', exact: true }).focus()
  await page.keyboard.press('Tab')
  const profileLink = navigation.getByRole('link', { name: 'Профиль', exact: true })
  await expectVisibleKeyboardFocus(profileLink)
  await page.keyboard.press('Enter')
  const form = page.getByRole('form', { name: 'Создание профиля', exact: true })
  await expect(form).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()
  await page.keyboard.press('Tab')
  await expectVisibleKeyboardFocus(form.getByLabel('Имя (необязательно)', { exact: true }))
  await page.keyboard.press('Tab')
  await expectVisibleKeyboardFocus(form.getByLabel('Рост, см', { exact: true }))
  await tabToControl(page, form.getByLabel('Пол для формулы расхода (необязательно)', { exact: true }))
  await tabToControl(page, form.getByRole('button', { name: 'Создать профиль', exact: true }))
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('уменьшение движения отключает анимацию и плавную прокрутку элементов управления', async ({ page, baseURL }) => {
  const { errors, external } = observeBrowser(page, baseURL)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/')
  const dayForm = page.getByRole('form', { name: 'Выбор дня', exact: true })
  await expect(dayForm).toBeVisible()
  const actions = page.getByRole('navigation', { name: 'Быстрые записи', exact: true })
  await expect(actions).toBeVisible()
  await dayForm.getByRole('button', { name: 'Открыть день', exact: true }).hover()
  const moving = await dayForm.locator('input, button').or(actions.getByRole('link')).evaluateAll(elements => elements.flatMap(element => {
    const style = getComputedStyle(element)
    const hasMotion = [...style.transitionDuration.split(','), ...style.animationDuration.split(',')].some(duration => Number.parseFloat(duration) > 0)
    return hasMotion || style.scrollBehavior !== 'auto' ? [{ control: element.getAttribute('aria-label') ?? element.textContent.trim(), transition: style.transitionDuration, animation: style.animationDuration, scroll: style.scrollBehavior }] : []
  }))
  expect(moving, 'При reduced motion элементы не анимируются и не прокручиваются плавно').toEqual([])
  await actions.getByRole('link', { name: 'Записать вес', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Вес', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

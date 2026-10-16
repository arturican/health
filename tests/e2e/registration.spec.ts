import { randomUUID } from 'node:crypto'
import axe from 'axe-core'
import { emailLink, setPassword } from './emailHelpers'
import { expect, test, type Page } from './fixtures'

test.use({ timezoneId: 'Europe/Moscow' })
const password = ' synthetic-registration-password '
async function fillRegistration(page: Page, email: string) {
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await page.getByLabel('Почта', { exact: true }).fill(email)
  await expect(page.getByLabel('Часовой пояс дневника')).toHaveValue('Europe/Moscow')
}
async function activateEmail(page: Page, email: string) {
  await setPassword(page, await emailLink(page, email), password)
}
async function signIn(page: Page, login: string, secret = password) {
  await page.getByLabel('Почта', { exact: true }).fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Разделы дневника', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
}

test('регистрация, профиль, reload, выход и повторный вход изолируют два аккаунта', async ({ page, context, baseURL }) => {
  const errors: string[] = [], external: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('request', request => { if (new URL(request.url()).origin !== baseURL) external.push(request.url()) })
  await context.clearCookies()
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  const first = 'signup-' + randomUUID().slice(0, 8) + '@example.test'
  await fillRegistration(page, first)
  await page.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Если регистрация доступна')
  await activateEmail(page, first)
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('')
  expect(await context.cookies()).toEqual([])
  await signIn(page, first)
  await expect(page.getByRole('form', { name: 'Создание профиля' })).toBeVisible()
  const cookie = (await context.cookies()).find(value => value.name === '__Host-health_session')
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' })
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill('Учебная регистрация')
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('70')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByText('Профиль и первое измерение сохранены', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Учебная регистрация', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вход в дневник' })).toBeVisible()
  expect(await page.evaluate(async () => (await fetch('/api/v1/profile')).status)).toBe(401)
  const second = 'signup-' + randomUUID().slice(0, 8) + '@example.test'
  await fillRegistration(page, second)
  await page.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Если регистрация доступна')
  await activateEmail(page, second)
  await signIn(page, second)
  await expect(page.getByRole('form', { name: 'Создание профиля' })).toBeVisible()
  expect(await page.evaluate(async () => {
    const response = await fetch('/api/v1/profile')
    const value: unknown = await response.json()
    return { status: response.status, value }
  })).toEqual({ status: 200, value: null })
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 })
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await signIn(page, first)
  await expect(page.getByText('Учебная регистрация', { exact: true })).toBeVisible()
  expect(errors).toEqual([]); expect(external).toEqual([])
})

test('повтор регистрации подтверждённой почты не заменяет пароль', async ({ page, context }) => {
  await context.clearCookies(); await page.goto('/')
  const email = 'repeat-' + randomUUID().slice(0, 8) + '@example.test'
  await fillRegistration(page, email)
  await page.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Если регистрация доступна')
  await activateEmail(page, email)
  await signIn(page, email)
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await fillRegistration(page, email)
  await page.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Если регистрация доступна')
  expect(await context.cookies()).toEqual([])
  await page.getByRole('button', { name: 'Уже есть аккаунт? Войти', exact: true }).click()
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('')
  await signIn(page, email)
})

test('регистрация доступна с клавиатуры, без нарушений axe и переполнения', async ({ page, context }, testInfo) => {
  await context.clearCookies(); await page.goto('/')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  const login = page.getByLabel('Почта', { exact: true })
  await expect(login).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Часовой пояс дневника')).toBeFocused()
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const controls = page.getByRole('form', { name: 'Регистрация' }).locator('input, button')
    for (const control of await controls.all()) {
      const box = await control.boundingBox()
      if (!box) throw new Error('Нет элемента регистрации')
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }
  await page.evaluate(() => { window.scrollTo(0, 0) })
  await page.screenshot({ path: testInfo.outputPath('registration-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 320, height: 400 })
  await page.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
  await expect(login).toHaveAttribute('aria-invalid', 'true')
  await expect(login).toBeFocused()
  for (const control of await page.locator('input, button').all()) {
    await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.addScriptTag({ content: axe.source })
  expect(await page.evaluate(async () => (await window.axe.run(document)).violations.map(value => value.id))).toEqual([])
  await page.evaluate(() => { window.scrollTo(0, 0) })
  await page.screenshot({ path: testInfo.outputPath('registration-mobile.png'), fullPage: true })
})

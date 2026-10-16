import { createHash, randomUUID } from 'node:crypto'
import axe from 'axe-core'
import { createPool } from '../../src/server/database'
import { expect, test, type Page } from './fixtures'
import { emailLink, registerEmail, setPassword, signInEmail } from './emailHelpers'

const password = ' synthetic-original-password ', replacement = ' synthetic-replacement-password '
const address = () => 'recovery-' + randomUUID().slice(0, 8) + '@example.test'
test.use({ timezoneId: 'Europe/Moscow' })
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  expect((await page.request.get('/api/v1/test-auth-window')).status()).toBe(200)
})
async function profile(page: Page, name: string) {
  await page.goto('/#profile')
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill(name)
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('70')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByText('Профиль и первое измерение сохранены', { exact: true })).toBeVisible()
}

test('письмо сбрасывает пароль, закрывает вкладки/другую сессию и сохраняет дневник', async ({ page, context, browser, baseURL }) => {
  await context.clearCookies(); await page.goto('/')
  const email = address(), urls: string[] = []
  page.on('request', request => { urls.push(request.url()) })
  await registerEmail(page, email)
  const verify = await emailLink(page, email)
  await setPassword(page, verify, password)
  await signInEmail(page, email.toUpperCase(), password)
  await expect(page.getByRole('complementary', { name: 'Хранение дневника' })).toContainText(email)
  await profile(page, 'Учебное восстановление')
  const otherTab = await context.newPage(); await otherTab.goto('/#profile')
  await expect(otherTab.getByText('Учебное восстановление', { exact: true })).toBeVisible()
  const device = await browser.newContext(), recovery = await browser.newContext()
  try {
    const devicePage = await device.newPage(); await devicePage.goto(baseURL ?? '')
    await signInEmail(devicePage, email, password)
    const recoveryPage = await recovery.newPage(); await recoveryPage.goto(baseURL ?? '')
    await recoveryPage.getByRole('button', { name: 'Забыли пароль?', exact: true }).click()
    await recoveryPage.getByLabel('Почта', { exact: true }).fill(email)
    await recoveryPage.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
    await expect(recoveryPage.getByRole('status')).toContainText('Если запрос доступен')
    const reset = await emailLink(page, email, 2)
    await setPassword(page, reset, replacement)
    await expect(otherTab.getByRole('form', { name: 'Вход в дневник', exact: true })).toBeVisible()
    await devicePage.reload()
    await expect(devicePage.getByRole('form', { name: 'Вход в дневник', exact: true })).toBeVisible()
    await page.getByLabel('Почта', { exact: true }).fill(email)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Неверная почта или пароль')
    await signInEmail(page, email, replacement)
    await page.goto('/#profile')
    await expect(page.getByText('Учебное восстановление', { exact: true })).toBeVisible()
    await page.goto(reset)
    await page.getByLabel('Новый пароль', { exact: true }).fill(password)
    await page.getByLabel('Повторите пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Сохранить пароль', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Ссылка недействительна или истекла')
    for (const link of [verify, reset]) {
      const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token')
      if (!token) throw new Error('Нет синтетического токена')
      expect(urls.some(url => url.includes(token))).toBe(false)
    }
    expect(urls.every(url => new URL(url).origin === baseURL)).toBe(true)
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
  } finally { await device.close(); await recovery.close(); await otherTab.close() }
})

test('истёкшее подтверждение отклоняется, новая verify-ссылка завершает регистрацию', async ({ page, context }) => {
  await context.clearCookies(); await page.goto('/')
  const email = address()
  await registerEmail(page, email); const expired = await emailLink(page, email)
  const value = process.env['HEALTH_E2E_ADMIN_URL']
  if (!value) throw new Error('Нет синтетической БД')
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/health_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error('Не тестовая БД')
  const admin = createPool(value)
  try {
    const secret = new URLSearchParams(new URL(expired).hash.slice(1)).get('token')
    if (!secret) throw new Error('Нет синтетического токена')
    const result = await admin.query(`UPDATE health.account_tokens SET created_at=created_at-interval '2 hours',
      expires_at=created_at-interval '1 second' WHERE token_hash=$1`, [createHash('sha256').update(secret).digest('hex')])
    expect(result.rowCount).toBe(1)
  } finally { await admin.end() }
  await page.goto(expired)
  await page.getByLabel('Новый пароль', { exact: true }).fill(password)
  await page.getByLabel('Повторите пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Сохранить пароль', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Ссылка недействительна или истекла')
  await page.getByRole('button', { name: 'Запросить новую ссылку', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Подтверждение почты', exact: true })).toBeVisible()
  await page.getByLabel('Почта', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Если запрос доступен')
  const fresh = await emailLink(page, email, 2)
  expect(fresh).not.toBe(expired)
  await setPassword(page, fresh, replacement)
  await signInEmail(page, email, replacement)
})

test('привязка прежнего аккаунта требует пароль, сохраняет профиль и оба способа входа', async ({ page, account }) => {
  await profile(page, 'Учебная привязка')
  await page.goto('/#settings')
  const email = address()
  await page.getByLabel('Почта для восстановления').fill(email)
  await page.getByLabel('Текущий пароль').fill('synthetic-incorrect-password')
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Проверьте почту и текущий пароль')
  await page.getByLabel('Текущий пароль').fill(account.password)
  await page.getByRole('button', { name: 'Подтвердить почту', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Если привязка доступна')
  const link = await emailLink(page, email)
  await setPassword(page, link, replacement)
  await signInEmail(page, email, replacement)
  await page.goto('/#profile')
  await expect(page.getByText('Учебная привязка', { exact: true })).toBeVisible()
  await page.goto('/#settings')
  await expect(page.getByText(email + ' — подтверждена.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await signInEmail(page, account.login, replacement)
  await page.goto('/#profile')
  await expect(page.getByText('Учебная привязка', { exact: true })).toBeVisible()
})

test('формы восстановления/пароля доступны с клавиатуры, без axe-ошибок и переполнения', async ({ page, context }, testInfo) => {
  await context.clearCookies(); await page.goto('/')
  await page.getByRole('button', { name: 'Забыли пароль?', exact: true }).click()
  await expect(page.getByLabel('Почта', { exact: true })).toBeFocused()
  for (const link of [null, '/#auth=reset_password&token=' + 'f'.repeat(64)]) {
    if (link) await page.goto(link)
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 400 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      for (const control of await page.locator('input, button').all()) {
        await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport()
        const box = await control.boundingBox()
        if (!box) throw new Error('Нет элемента формы')
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
    await page.addScriptTag({ content: axe.source })
    expect(await page.evaluate(async () => (await window.axe.run(document)).violations.map(value => value.id))).toEqual([])
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.screenshot({ path: testInfo.outputPath('password-recovery.png'), fullPage: true })
})

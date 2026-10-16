import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from './fixtures'
import { createAccount } from '../../src/server/accounts'
import { createPool } from '../../src/server/database'

async function login(page: Page, login: string, password: string) {
  await page.getByLabel('Логин', { exact: true }).fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Разделы дневника', exact: true })).toBeVisible()
}

test('серверный профиль доступен в новом браузере только своему аккаунту без локальной копии', async ({ page, browser, baseURL, account }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#profile')
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill('Синтетический серверный профиль')
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('70')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByText('Профиль и первое измерение сохранены', { exact: true })).toBeVisible()
  if (!baseURL) throw new Error('Нет локального адреса приложения')
  const fresh = await browser.newContext({ baseURL })
  const admin = createPool(process.env['HEALTH_E2E_ADMIN_URL'])
  try {
    const second = await fresh.newPage()
    await second.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
    await second.goto('/#profile')
    await expect(second.getByRole('heading', { name: 'Вход в дневник' })).toBeVisible()
    await login(second, account.login, account.password)
    await expect(second.getByText('Синтетический серверный профиль', { exact: true })).toBeVisible()
    expect(await second.evaluate(async () => ({
      local: localStorage.length, session: sessionStorage.length,
      databases: (await indexedDB.databases()).map(value => value.name),
    }))).toEqual({ local: 0, session: 0, databases: [] })
    await second.reload()
    await expect(second.getByText('Синтетический серверный профиль', { exact: true })).toBeVisible()
    await second.getByRole('button', { name: 'Выйти', exact: true }).click()
    const other = await createAccount(admin, { login: 'other-' + randomUUID().slice(0, 8), password: account.password, timezone: 'UTC' })
    await login(second, other.login, account.password)
    await expect(second.getByRole('form', { name: 'Создание профиля' })).toBeVisible()
    await expect(second.getByText('Синтетический серверный профиль', { exact: true })).toHaveCount(0)
    const response = await second.evaluate(async () => {
      const response = await fetch('/api/v1/profile')
      const value: unknown = await response.json()
      return { status: response.status, value }
    })
    expect(response).toEqual({ status: 200, value: null })
  } finally { await fresh.close(); await admin.end() }
})

test('выход закрывает обе вкладки, запрещает чтение и позволяет войти повторно', async ({ page, context, account }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/#today')
  await expect(page.getByRole('heading', { name: 'Сегодня', level: 1 })).toBeVisible()
  const other = await context.newPage()
  await other.goto('/#weight')
  await expect(other.getByRole('heading', { name: 'Вес', level: 1 })).toBeVisible()
  const cookie = (await context.cookies()).find(value => value.name === '__Host-health_session')
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' })
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вход в дневник' })).toBeVisible()
  await expect(other.getByRole('heading', { name: 'Вход в дневник' })).toBeVisible()
  expect(await page.evaluate(async () => (await fetch('/api/v1/weights')).status)).toBe(401)
  await login(page, account.login, account.password)
  await expect(other.getByRole('heading', { name: 'Вес', level: 1 })).toBeVisible()
})

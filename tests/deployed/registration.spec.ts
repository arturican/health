import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('HTTPS: новый синтетический аккаунт регистрируется, входит и выходит', async ({ page, context }, testInfo) => {
  const login = 'live-signup-' + randomUUID().slice(0, 12)
  const password = 'synthetic-live-' + randomUUID()
  // Only identifiers are saved for exact administrative cleanup; no credentials.
  await writeFile(testInfo.outputPath('synthetic-account.json'), JSON.stringify({ login }), { mode: 0o600 })
  const errors: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  await page.goto('/#profile')
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await page.getByLabel('Логин', { exact: true }).fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByLabel('Повторите пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Аккаунт создан')
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('')
  expect(await context.cookies()).toEqual([])
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('form', { name: 'Создание профиля' })).toBeVisible()
  const cookie = (await context.cookies()).find(value => value.name === '__Host-health_session')
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' })
  await page.reload()
  await expect(page.getByRole('form', { name: 'Создание профиля' })).toBeVisible()
  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вход в дневник' })).toBeVisible()
  expect(await page.evaluate(async () => (await fetch('/api/v1/profile')).status)).toBe(401)
  expect(errors).toEqual([])
})

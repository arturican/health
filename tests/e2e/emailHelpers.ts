import { z } from 'zod'
import { expect, type Page } from './fixtures'

export async function emailLink(page: Page, email: string, minimum = 1) {
  const read = async () => z.array(z.object({ to: z.string(), text: z.string() })).parse(await (await page.request.get('/api/v1/test-mail')).json())
  const matching = async () => (await read()).filter(value => value.to.toLowerCase() === email.toLowerCase())
  await expect.poll(async () => (await matching()).length).toBeGreaterThanOrEqual(minimum)
  const link = (await matching()).at(-1)?.text.match(/https?:\/\/\S+/)?.[0]
  if (!link || new URL(link).origin !== new URL(page.url()).origin) throw new Error('Нет локальной синтетической ссылки')
  return link
}
export async function setPassword(page: Page, link: string, password: string) {
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Задайте новый пароль' })).toBeVisible()
  await expect(page).not.toHaveURL(/token=/)
  await page.getByLabel('Новый пароль', { exact: true }).fill(password)
  await page.getByLabel('Повторите пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Сохранить пароль', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пароль сохранён' })).toBeVisible()
  await page.getByRole('button', { name: 'Перейти ко входу', exact: true }).click()
  await expect(page.getByRole('form', { name: 'Вход в дневник', exact: true })).toBeVisible()
}
export async function registerEmail(page: Page, email: string) {
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  await page.getByLabel('Почта', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Отправить ссылку', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Если регистрация доступна')
}
export async function signInEmail(page: Page, email: string, password: string) {
  await page.getByLabel('Почта', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Разделы дневника', exact: true })).toBeVisible()
}

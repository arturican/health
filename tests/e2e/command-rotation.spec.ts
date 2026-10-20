import { expect, test } from './fixtures'
import { createPool } from '../../src/server/database'

test('ротация объясняет сброс черновика, сохраняет план и разрешает новую запись', async ({ page, account }) => {
  const value = process.env['HEALTH_E2E_ADMIN_URL']
  if (!value) throw new Error('Нет изолированной E2E БД')
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/health_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error('Не тестовая БД')
  const admin = createPool(value)
  const failures: string[] = []
  page.on('pageerror', error => { failures.push(error.message) })
  page.on('console', message => {
    if (message.type() !== 'error') return
    const location = message.location().url
    if (message.text().startsWith('Failed to load resource: the server responded with a status of 409')
      && location.endsWith('/api/v1/settings')) return
    failures.push(message.text())
  })
  try {
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
    await page.goto('/#settings')
    const goal = page.getByLabel('Калорийная цель, ккал/сутки (необязательно)', { exact: true })
    await goal.fill('2000')
    await page.getByRole('button', { name: 'Сохранить новую версию', exact: true }).click()
    await expect(page.getByText('Версия 1, действует с 2026-10-14', { exact: true })).toBeVisible()
    await goal.fill('2100')
    const photos = page.getByLabel('Показывать фото', { exact: true })
    await photos.uncheck()
    await admin.query("INSERT INTO health.commands(user_id,id,request_hash,response) SELECT $1,gen_random_uuid(),repeat('0',64),'null'::jsonb FROM generate_series(1,90000)", [account.id])
    const response = page.waitForResponse(result => result.url().endsWith('/api/v1/settings') && result.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Сохранить видимость', exact: true }).click()
    const rotated = await response
    expect(rotated.status()).toBe(409)
    expect(rotated.headers()['x-health-error-code']).toBe('command_rotation')
    const notice = page.getByText('Дневник обновлён. Несохранённый ввод сброшен; проверьте записи перед повторным действием.', { exact: true })
    await expect(notice).toBeVisible()
    await expect(goal).toHaveValue('')
    await expect(photos).toBeChecked()
    const history = page.getByRole('list', { name: 'Версии энергетического плана' })
    await expect(history.getByRole('listitem')).toHaveCount(1)
    await expect(history.getByText('Цель: 2000 ккал/сутки.', { exact: true })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Обновление данных' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Закрыть сообщение', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(notice).not.toBeVisible()
    await expect(page.getByRole('main')).toBeFocused()
    await goal.fill('2200')
    await page.getByRole('button', { name: 'Сохранить новую версию', exact: true }).click()
    await expect(page.getByText('Версия 2, действует с 2026-10-14', { exact: true })).toBeVisible()
    expect(failures).toEqual([])
  } finally { await admin.end() }
})

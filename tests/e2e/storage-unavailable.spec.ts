import { expect, test } from './fixtures'
import axe from 'axe-core'

for (const failure of ['missing', 'denied'] as const) {
  test(`недоступный IndexedDB (${failure}) не мешает серверному дневнику и сохранённым записям`, async ({ page, baseURL }) => {
    const errors: string[] = []
    const externalRequests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', request => {
      const url = new URL(request.url())
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) externalRequests.push(request.url())
    })
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
    await page.addInitScript(mode => {
      if (!new URL(location.href).searchParams.has('synthetic-storage-unavailable')) return
      Object.defineProperty(window, 'indexedDB', mode === 'missing'
        ? { configurable: true, value: undefined }
        : { configurable: true, get() { throw new DOMException('Synthetic storage refusal', 'SecurityError') } })
    }, failure)
    await page.goto('/#profile')
    await page.getByLabel('Имя (необязательно)', { exact: true }).fill('Синтетическая сохранность')
    await page.getByLabel('Рост, см', { exact: true }).fill('170')
    await page.getByLabel('Вес, кг', { exact: true }).fill('70')
    await page.getByLabel('Дата первого измерения', { exact: true }).fill('2026-10-12')
    await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
    await expect(page.getByText('Профиль и первое измерение сохранены', { exact: true })).toBeVisible()

    for (const route of ['weight', 'photos', 'settings']) {
      await page.goto(`/?synthetic-storage-unavailable=1#${route}`)
      const heading = route === 'weight' ? 'Вес' : route === 'photos' ? 'Фото' : 'Настройки'
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: /Загружаем/ })).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(page.getByRole('main')).toHaveCount(1)
      if (route === 'weight') await expect(page.getByRole('list', { name: 'История веса' }).getByText('70 кг', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      expect(await page.evaluate(async () => (await window.axe.run(document)).violations)).toEqual([])
    }

    await page.goto('/#profile')
    await expect(page.getByText('Синтетическая сохранность', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Вес', exact: true }).click()
    await expect(page.getByRole('form', { name: 'Новое измерение' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'История веса' }).getByText('70 кг', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
    expect(externalRequests).toEqual([])
  })
}

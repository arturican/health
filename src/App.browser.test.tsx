import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from './App'

test('стартовый экран и переход работают в настоящем браузере', async () => {
  await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
  await page.getByRole('link', { name: 'Что будет в дневнике' }).click()
  await expect.element(page.getByRole('region', { name: 'Что будет в дневнике' })).toBeVisible()
})

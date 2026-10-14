import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from './App'
import './styles.css'

test('стартовый экран и переход работают в настоящем браузере', async () => {
  await render(<App />)
  await expect.element(page.getByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
  await page.getByRole('link', { name: 'Что будет в дневнике' }).click()
  await expect.element(page.getByRole('region', { name: 'Что будет в дневнике' })).toBeVisible()
})

test('экран проходит проверку доступности в браузере', async () => {
  const screen = await render(<App />)
  const result = await axe.run(screen.container)
  expect(result.violations).toEqual([])
})

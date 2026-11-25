import { expect, test } from './fixtures'

test('Питание: график и итоги разделяют чтение выбранного дня', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  const paths: string[] = []
  page.on('request', request => {
    if (request.method() === 'GET') paths.push(new URL(request.url()).pathname)
  })
  const complete = page.getByRole('checkbox', { name: 'За этот день внесена вся еда' })

  async function countReads(phase: string) {
    await expect(complete).toBeEnabled()
    await expect(page.getByRole('status').filter({ hasText: /Загружаем/ })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    const food = paths.filter(path => path === '/api/v1/food').length
    const nutrition = paths.filter(path => path.startsWith('/api/v1/nutrition-days/')).length
    paths.length = 0
    return { phase, food, nutrition }
  }

  await page.goto('/#nutrition')
  const initial = await countReads('открытие')
  await page.getByLabel('День дневника').fill('2026-10-13')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect(page.getByText('Открыт день: 13.10.2026')).toBeVisible()
  const dayChange = await countReads('смена дня')
  await complete.click()
  await expect(complete).toBeChecked()
  const write = await countReads('запись')

  expect([initial, dayChange, write]).toEqual([
    { phase: 'открытие', food: 4, nutrition: 2 },
    { phase: 'смена дня', food: 4, nutrition: 2 },
    { phase: 'запись', food: 4, nutrition: 2 },
  ])
})

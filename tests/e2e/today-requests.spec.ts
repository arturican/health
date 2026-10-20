import { expect, test } from './fixtures'
test('Сегодня: ограниченный бюджет GET на вход/focus/запись', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  const paths: string[] = []
  let lastFinish = 0
  page.on('request', request => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname.startsWith('/api/v1/') && url.pathname !== '/api/v1/auth/session') paths.push(url.pathname)
  })
  page.on('requestfinished', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) lastFinish = performance.now() })
  const complete = page.getByRole('checkbox', { name: 'За этот день внесена вся еда', exact: true })
  async function settle(phase: string, start: number) {
    await expect(complete).toBeEnabled()
    await expect(page.getByRole('status').filter({ hasText: /Загружаем/ })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    const counts = Object.fromEntries([...new Set(paths)].sort().map(path => [path, paths.filter(item => item === path).length]))
    console.log(JSON.stringify({ phase, total: paths.length, counts, networkMs: Math.round(lastFinish - start) }))
    expect(paths.length).toBeLessThanOrEqual(12)
    expect(paths.filter(path => path === '/api/v1/diary-state').length).toBeLessThanOrEqual(5)
    expect(paths.filter(path => path === '/api/v1/food')).toHaveLength(1)
    expect(paths.filter(path => path.startsWith('/api/v1/nutrition-days/'))).toHaveLength(1)
    paths.length = 0
  }
  let start = performance.now()
  await page.goto('/#today')
  await settle('initial', start)
  start = performance.now()
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')) })
  await settle('focus', start)
  start = performance.now()
  await complete.click()
  await expect(complete).toBeChecked()
  await settle('mutation', start)
})

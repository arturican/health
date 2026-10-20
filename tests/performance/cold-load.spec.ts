import { z } from 'zod'
import { createPool } from '../../src/server/database'
import { expect, test } from '../e2e/fixtures'

test.setTimeout(90000)
for (const run of [1, 2, 3, 4, 5]) test('cold load ' + String(run), async ({ page, context, account }) => {
  const admin = createPool(process.env['HEALTH_E2E_ADMIN_URL'])
  try { await admin.query('UPDATE health.settings SET show_documents=true,show_photos=true WHERE user_id=$1', [account.id]) }
  finally { await admin.end() }
  const client = await context.newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  await client.send('Network.clearBrowserCache')
  await client.send('Network.emulateNetworkConditionsByRule', { offline: false, matchedNetworkConditions: [
    { urlPattern: '', latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 },
  ] })
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await client.send('Performance.enable')
  const compile: Record<string, number> = {}
  client.on('Tracing.dataCollected', (value: unknown) => {
    const events = z.object({ value: z.array(z.object({ name: z.string(), dur: z.number().optional() })) }).parse(value)
    for (const event of events.value) if (/^(v8[.]|V8[.]).*(?:compile|parse)/i.test(event.name) && event.dur) {
      compile[event.name] = (compile[event.name] ?? 0) + event.dur / 1000
    }
  })
  await client.send('Tracing.start', { categories: 'v8,devtools.timeline,disabled-by-default-v8.compile' })
  const errors: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('requestfailed', request => { errors.push('Network ' + new URL(request.url()).pathname) })
  page.on('response', response => {
    if (response.status() >= 400) errors.push('HTTP ' + String(response.status()) + ' ' + new URL(response.url()).pathname)
  })
  await page.goto('/#today')
  await expect(page.getByRole('checkbox', { name: 'За этот день внесена вся еда', exact: true })).toBeEnabled()
  const readyMs = await page.evaluate(() => performance.now())
  await expect(page.getByRole('status').filter({ hasText: /Загружаем/ })).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  const initial = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').filter(
      (item): item is PerformanceResourceTiming => item instanceof PerformanceResourceTiming)
    return { fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      assets: resources.filter(item => new URL(item.name).pathname.startsWith('/assets/')).map(item =>
        ({ path: new URL(item.name).pathname, encoded: item.encodedBodySize, decoded: item.decodedBodySize,
          transfer: item.transferSize, responseEnd: item.responseEnd })),
      lastApiMs: Math.max(...resources.filter(item => new URL(item.name).pathname.startsWith('/api/')).map(item => item.responseEnd)) }
  })
  expect(Number.isFinite(initial.fcpMs)).toBe(true)
  expect(initial.fcpMs).toBeGreaterThan(0)
  expect(Number.isFinite(initial.lastApiMs)).toBe(true)
  expect(Number.isFinite(readyMs)).toBe(true)
  expect(initial.assets.some(asset => asset.path.endsWith('.js'))).toBe(true)
  for (const asset of initial.assets) {
    expect(asset.encoded).toBeGreaterThan(0)
    expect(asset.decoded).toBeGreaterThan(0)
    if (process.env['HEALTH_BENCH_ENCODING'] === 'gzip') expect(asset.encoded).toBeLessThan(asset.decoded)
    else expect(asset.encoded).toBe(asset.decoded)
  }
  const metrics = z.object({ metrics: z.array(z.object({ name: z.string(), value: z.number() })) })
    .parse(await client.send('Performance.getMetrics'))
  expect(metrics.metrics.some(item => item.name === 'ScriptDuration' && item.value > 0)).toBe(true)
  const traced = new Promise<void>(resolve => { client.once('Tracing.tracingComplete', () => { resolve() }) })
  await client.send('Tracing.end')
  await traced
  expect(compile['V8.CompileCode']).toBeGreaterThan(0)
  const transitions = []
  for (const [route, title] of [['documents', 'Документы'], ['settings', 'Настройки']] as const) {
    const started = await page.evaluate(() => performance.now())
    await page.getByRole('link', { name: title, exact: true }).first().click()
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /Загружаем/ })).toHaveCount(0)
    transitions.push({ route, observedMs: (await page.evaluate(() => performance.now())) - started })
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('alert')).toHaveCount(0)
  }
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
  console.log(JSON.stringify({ run, encoding: process.env['HEALTH_BENCH_ENCODING'] ?? 'identity',
    ...initial, readyMs, runtime: metrics.metrics.filter(item => ['ScriptDuration', 'TaskDuration'].includes(item.name)),
    compileInclusiveMs: compile, transitions }))
})

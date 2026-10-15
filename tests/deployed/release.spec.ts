import { expect, test } from '@playwright/test'

test('публикация имеет ожидаемый SHA, HTTPS и редирект HTTP', async ({ request, baseURL }) => {
  if (!baseURL) throw new Error('Deployment baseURL is required')
  const revision = await request.get('/release.txt', { headers: { 'Cache-Control': 'no-cache' } })
  expect(revision.status()).toBe(200)
  expect((await revision.text()).trim()).toBe(process.env['EXPECTED_RELEASE'])
  const redirect = await request.get('http://dev.arturican.com/', { maxRedirects: 0 })
  expect([301, 308]).toContain(redirect.status())
  expect(redirect.headers()['location']).toBe(`${baseURL}/`)
  const page = await request.get('/')
  expect(page.status()).toBe(200)
  expect(page.headers()['content-type']).toContain('text/html')
  const missing = await request.get('/synthetic-missing-route')
  expect(missing.status()).toBe(404)
})

import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

test('production CSP блокирует inline script и внешние соединения', async ({ page }) => {
  const errors: string[] = [], expectedViolations: string[] = []
  let external = 0
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => {
    if (message.type() !== 'error') return
    if (message.text().includes('Content Security Policy')) expectedViolations.push(message.text())
    else errors.push(message.text())
  })
  // A failing policy cannot cause an actual external network request.
  await page.route('https://csp-blocked.invalid/**', route => { external++; return route.abort() })
  const response = await page.goto('/')
  const expected = (await readFile('deploy/nginx.conf', 'utf8')).match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1]
  expect(expected).toBeTruthy()
  expect(response?.headers()['content-security-policy']).toBe(expected)
  await expect(page.getByRole('navigation', { name: 'Разделы дневника', exact: true })).toBeVisible()
  const result = await page.evaluate(async () => {
    const blocked = (directive: string) => new Promise<void>(resolve => {
      const listener = (event: SecurityPolicyViolationEvent) => {
        if (event.effectiveDirective.startsWith(directive)) {
          document.removeEventListener('securitypolicyviolation', listener)
          resolve()
        }
      }
      document.addEventListener('securitypolicyviolation', listener)
    })
    const scriptDenied = blocked('script-src')
    const script = document.createElement('script')
    script.textContent = 'document.documentElement.dataset.cspProbe = "executed"'
    document.body.append(script)
    await scriptDenied
    script.remove()
    const connectionDenied = blocked('connect-src')
    const rejected = await fetch('https://csp-blocked.invalid/probe').then(() => false, () => true)
    await connectionDenied
    return { executed: document.documentElement.dataset.cspProbe ?? null, rejected }
  })
  expect(result).toEqual({ executed: null, rejected: true })
  expect(external).toBe(0)
  expect(errors).toEqual([])
  expect(expectedViolations.some(value => value.includes('script-src'))).toBe(true)
  expect(expectedViolations.some(value => value.includes('connect-src'))).toBe(true)
})

import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import { createAccount, type Account } from '../../src/server/accounts'
import { createPool } from '../../src/server/database'
import { createSessions } from '../../src/server/sessions'

export { expect }
export type { Page, Locator, TestInfo } from '@playwright/test'
export const test = base.extend<{ account: Account & { password: string } }>({
  account: [async ({ context, baseURL }, provide) => {
    if (baseURL !== 'http://127.0.0.1:4173') throw new Error('Фикстуры разрешены только для локального API')
    const values = ['HEALTH_E2E_ADMIN_URL', 'HEALTH_E2E_RUNTIME_URL'].map(key => {
      const value = process.env[key]
      if (!value) throw new Error('E2E требует отдельную тестовую БД')
      const url = new URL(value)
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/health_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error('Не тестовая БД')
      return value
    })
    const admin = createPool(values[0]), runtime = createPool(values[1])
    try {
      const password = 'synthetic-password-only'
      const account = await createAccount(admin, { login: 'e2e-' + randomUUID().slice(0, 8), password, timezone: 'Europe/Moscow' })
      await admin.query('UPDATE health.users SET created_at=$1 WHERE id=$2', ['2026-10-14T10:00:00Z', account.id])
      const sessions = await createSessions(runtime)
      const session = await sessions.login({ login: account.login, password }, null, new Date('2026-10-14T12:00:00Z'))
      if (!session) throw new Error('Не создана тестовая сессия')
      // Chromium treats loopback as trustworthy. Secure/HttpOnly stay enabled.
      await context.addCookies([{ name: '__Host-health_session', value: session.token, url: 'https://127.0.0.1:4173', secure: true, httpOnly: true, sameSite: 'Lax' }])
      await provide({ ...account, password })
    } finally { await runtime.end(); await admin.end() }
  }, { auto: true }],
})

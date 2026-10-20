import { expect, type Page, type Locator } from '@playwright/test'

export async function verifyRefresh(page: Page, path: string, save: Locator | (() => Promise<void>), action: Locator) {
  let release = () => {}, entered = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  await page.route(path, async route => {
    if (route.request().method() === 'GET') { entered(); await gate }
    await route.continue()
  })
  try { if (typeof save === 'function') await save(); else await save.click(); await started; await expect(action).toBeDisabled() }
  finally { release(); await page.unrouteAll({ behavior: 'wait' }) }
  await expect(action).toBeEnabled()
}

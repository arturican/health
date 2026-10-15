import { defineConfig } from '@playwright/test'
import local from '../../playwright.config'

if (!/^[0-9a-f]{40}$/.test(process.env['EXPECTED_RELEASE'] ?? '')) {
  throw new Error('Set EXPECTED_RELEASE to the full deployed Git SHA')
}

export default defineConfig({
  ...local,
  testDir: '..',
  testMatch: ['e2e/*.spec.ts', 'deployed/release.spec.ts'],
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  // Each test owns a fresh browser context; no persistent user profile is opened.
  webServer: [],
  workers: 2,
  timeout: 60_000,
  use: { ...local.use, baseURL: 'https://dev.arturican.com' },
})

import { defineConfig } from '@playwright/test'
import base from '../../playwright.config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'year-backup.spec.ts',
  globalSetup: '../e2e/setup.ts',
  outputDir: '/tmp/health-year-backup-results',
  reporter: 'list',
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { HEALTH_API_PROXY: 'http://127.0.0.1:4181' },
    wait: { stdout: /Local:.*127\.0\.0\.1:4173/ },
    reuseExistingServer: false,
  },
  timeout: 180000,
  expect: { timeout: 60000 },
  use: { ...base.use, trace: 'off', screenshot: 'only-on-failure' },
})

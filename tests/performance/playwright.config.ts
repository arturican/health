import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import base from '../../playwright.config'
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'cold-load.spec.ts',
  globalSetup: '../e2e/setup.ts',
  outputDir: '/tmp/health-cold-load-results',
  reporter: 'list',
  projects: [{ name: 'cold-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } }],
  webServer: { command: 'node tests/performance/server.mjs',
    cwd: fileURLToPath(new URL('../../', import.meta.url)), url: 'http://127.0.0.1:4173', reuseExistingServer: false },
})

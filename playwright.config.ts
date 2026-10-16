import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  globalSetup: './tests/e2e/setup.ts',
  // Large backups share a bounded server slot; each test still owns its account.
  workers: 1,
  forbidOnly: true,
  retries: 0,
  updateSnapshots: 'none',
  reporter: [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixels: 0 },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    env: { HEALTH_API_PROXY: 'http://127.0.0.1:4181' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})

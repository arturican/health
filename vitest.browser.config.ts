import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.browser.test.tsx'],
    allowOnly: false,
    browser: {
      enabled: true,
      headless: !process.env['DISPLAY'] && !process.env['WAYLAND_DISPLAY'],
      provider: playwright({ launchOptions: executablePath ? { executablePath } : {} }),
      instances: [{ browser: 'chromium' }],
    },
  },
})

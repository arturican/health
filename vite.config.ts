import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api/': { target: process.env['HEALTH_API_PROXY'] ?? 'http://127.0.0.1:3001' } } },
  preview: { proxy: { '/api/': { target: process.env['HEALTH_API_PROXY'] ?? 'http://127.0.0.1:3001' } } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.browser.test.tsx'],
    allowOnly: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx'],
      reporter: ['text', 'html', 'json'],
      thresholds: { statements: 80, lines: 80, functions: 80, branches: 70 },
    },
  },
})

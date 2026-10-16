import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Isolated UI fixtures only; production E2E exercise the real API.
vi.mock('../src/dataAccess', async () => import('../src/legacy/dataAccess'))

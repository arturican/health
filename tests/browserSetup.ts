import { vi } from 'vitest'

// Component fixtures retain native IndexedDB; production E2E exercise PostgreSQL.
vi.mock('../src/dataAccess', async () => import('../src/legacy/dataAccess'))

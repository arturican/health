import { Pool } from 'pg'

export function databaseUrl(value: string | undefined): string {
  try {
    if (!value) throw new Error()
    const url = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2 || url.hash) throw new Error()
    return value
  } catch { throw new Error('Требуется корректный серверный URL PostgreSQL') }
}

export function createPool(value: string | undefined): Pool {
  const pool = new Pool({
    connectionString: databaseUrl(value), max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000, statement_timeout: 15000,
  })
  // Idle connection failures must not terminate the process or disclose credentials.
  pool.on('error', () => { process.stderr.write('Соединение с БД потеряно\n') })
  return pool
}

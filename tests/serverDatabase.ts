import { randomUUID } from 'node:crypto'
import { createPool } from '../src/server/database'

/** Dedicated synthetic test DB only; never falls back to application credentials. */
export async function testDatabase() {
  const value = process.env.TEST_DATABASE_URL
  if (!value) throw new Error('Для SQL-тестов требуется TEST_DATABASE_URL отдельной БД health_test')
  const url = new URL(value)
  if (url.pathname !== '/health_test' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('SQL-тесты разрешены только в локальной health_test')
  }
  const admin = createPool(value)
  const name = `health_test_${randomUUID().replaceAll('-', '')}`
  try { await admin.query(`CREATE DATABASE ${name}`) }
  catch (error) { await admin.end(); throw error }
  url.pathname = `/${name}`
  const pool = createPool(url.toString())
  return { pool, async close() {
    await pool.end()
    try { await admin.query(`DROP DATABASE ${name}`) }
    finally { await admin.end() }
  } }
}

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createPool } from '../src/server/database'

/** Dedicated synthetic test DB only; never falls back to application credentials. */
export async function testDatabase(namespace: 'health_test' | 'health_restore' = 'health_test') {
  const value = process.env.TEST_DATABASE_URL
  if (!value) throw new Error('Для SQL-тестов требуется TEST_DATABASE_URL отдельной БД health_test')
  const url = new URL(value)
  if (url.pathname !== '/health_test' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('SQL-тесты разрешены только в локальной health_test')
  }
  const admin = createPool(value)
  const name = `${namespace}_${randomUUID().replaceAll('-', '')}`
  const login = `${name}_user`
  const password = randomUUID()
  try {
    await admin.query(await readFile('deploy/database-roles.sql', 'utf8'))
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' IN ROLE health_runtime`)
    await admin.query(`CREATE DATABASE ${name}`)
  }
  catch (error) { await admin.end(); throw error }
  url.pathname = `/${name}`
  const pool = createPool(url.toString())
  url.username = login
  url.password = password
  const runtime = createPool(url.toString())
  return { pool, runtime, async close() {
    await runtime.end()
    await pool.end()
    try { await admin.query(`DROP DATABASE ${name}`); await admin.query(`DROP ROLE ${login}`) }
    finally { await admin.end() }
  } }
}

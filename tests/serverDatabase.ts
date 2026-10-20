import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Pool } from 'pg'
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
  let roleCreated = false
  let databaseCreated = false
  let pool: Pool | undefined
  let runtime: Pool | undefined
  async function cleanup() {
    const errors: unknown[] = []
    async function attempt(work: () => Promise<unknown>) {
      try { await work() } catch (error) { errors.push(error) }
    }
    if (runtime) { const acquired = runtime; await attempt(() => acquired.end()) }
    if (pool) { const acquired = pool; await attempt(() => acquired.end()) }
    if (databaseCreated) await attempt(() => admin.query('DROP DATABASE ' + name))
    if (roleCreated) await attempt(() => admin.query('DROP ROLE ' + login))
    await attempt(() => admin.end())
    return errors
  }
  try {
    await admin.query(await readFile('deploy/database-roles.sql', 'utf8'))
    await admin.query("CREATE ROLE " + login + " LOGIN PASSWORD '" + password + "' IN ROLE health_runtime")
    roleCreated = true
    await admin.query('CREATE DATABASE ' + name)
    databaseCreated = true
    url.pathname = '/' + name
    pool = createPool(url.toString())
    url.username = login
    url.password = password
    runtime = createPool(url.toString())
    let closing: Promise<void> | undefined
    return { pool, runtime, close() {
      closing ??= cleanup().then(errors => {
        if (errors.length) throw new AggregateError(errors, 'Не удалось очистить ресурсы тестовой БД')
      })
      return closing
    } }
  } catch (error) {
    const errors = await cleanup()
    if (errors.length) throw new AggregateError([error, ...errors], 'Ошибка создания и очистки тестовой БД')
    throw error
  }
}

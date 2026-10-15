import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Pool } from 'pg'
import { z } from 'zod'

export interface Migration { name: string; sql: string }
const rowSchema = z.object({ name: z.string(), checksum: z.string() })

export async function readMigrations(directory = 'migrations'): Promise<Migration[]> {
  const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  return Promise.all(names.map(async name => ({ name, sql: await readFile(join(directory, name), 'utf8') })))
}

export async function migrate(pool: Pool, migrations: readonly Migration[]): Promise<number> {
  const names = migrations.map(item => item.name)
  if (names.some((name, index) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(name) || (index > 0 && name <= (names[index - 1] ?? '')))) {
    throw new Error('Неверный порядок или имя миграций')
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(1729, 160)')
    await client.query('CREATE SCHEMA IF NOT EXISTS health')
    await client.query(`CREATE TABLE IF NOT EXISTS health.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL CHECK (length(checksum) = 64),
      applied_at timestamptz NOT NULL DEFAULT now())`)
    const result = await client.query<Record<string, unknown>>('SELECT name, checksum FROM health.schema_migrations ORDER BY name')
    const applied = z.array(rowSchema).parse(result.rows)
    const checksums = migrations.map(item => createHash('sha256').update(item.sql).digest('hex'))
    if (applied.some((row, index) => row.name !== names[index] || row.checksum !== checksums[index])) {
      throw new Error('Применённая миграция отсутствует или изменена')
    }
    for (const [index, migration] of migrations.entries()) {
      if (index < applied.length) continue
      await client.query(migration.sql)
      await client.query('INSERT INTO health.schema_migrations(name, checksum) VALUES ($1, $2)', [migration.name, checksums[index]])
    }
    await client.query('COMMIT')
    return migrations.length - applied.length
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

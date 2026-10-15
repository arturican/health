import { createPool } from './database.js'
import { migrate, readMigrations } from './migrations.js'

try {
  const pool = createPool(process.env.MIGRATION_DATABASE_URL)
  try {
    const count = await migrate(pool, await readMigrations())
    process.stdout.write(`Применено миграций: ${String(count)}\n`)
  } finally { await pool.end() }
} catch {
  process.stderr.write('Миграции не выполнены: проверьте подключение, права и неизменность SQL-файлов\n')
  process.exitCode = 1
}

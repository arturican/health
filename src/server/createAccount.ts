import { createAccount } from './accounts.js'
import { createPool } from './database.js'

try {
  const pool = createPool(process.env.MIGRATION_DATABASE_URL)
  try {
    await createAccount(pool, {
      login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD,
      timezone: process.env.ADMIN_TIMEZONE,
    })
    process.stdout.write('Аккаунт создан\n')
  } finally { await pool.end() }
} catch {
  process.stderr.write('Аккаунт не создан: проверьте серверные настройки, ввод и уникальность логина\n')
  process.exitCode = 1
}

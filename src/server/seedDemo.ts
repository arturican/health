import { createPool } from './database.js'
import { seedDemo } from './seedRecords.js'

try {
  const admin = createPool(process.env.MIGRATION_DATABASE_URL)
  try {
    const runtime = createPool(process.env.DATABASE_URL)
    try {
      const result = await seedDemo(admin, runtime, {
        login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD, timezone: process.env.ADMIN_TIMEZONE,
      })
      process.stdout.write(result.seeded ? 'Демонстрационный дневник создан\n' : 'Демонстрация уже загружена; данные и пароль сохранены\n')
    } finally { await runtime.end() }
  } finally { await admin.end() }
} catch {
  process.stderr.write('Демонстрация не загружена: проверьте настройки, права ролей и отсутствие прежних данных дневника\n')
  process.exitCode = 1
}

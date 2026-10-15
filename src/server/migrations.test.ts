// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { databaseUrl } from './database'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
beforeEach(async () => { database = await testDatabase() })
afterEach(async () => { await database.close() })

it.each([undefined, '', 'http://example.com/private', 'postgresql://localhost', 'postgresql://u@localhost/db#secret'])('отклоняет неверный URL без его раскрытия', value => {
  expect(() => databaseUrl(value)).toThrow('Требуется корректный серверный URL PostgreSQL')
})

it('применяет реальные миграции с нуля и повторно без изменений', async () => {
  const migrations = await readMigrations()
  expect(await migrate(database.pool, migrations)).toBe(migrations.length)
  expect(await migrate(database.pool, migrations)).toBe(0)
  expect((await database.pool.query('SELECT * FROM health.schema_migrations')).rowCount).toBe(migrations.length)
})

it('отклоняет изменённую и отсутствующую применённую миграцию', async () => {
  const migrations = await readMigrations()
  await migrate(database.pool, migrations)
  await expect(migrate(database.pool, migrations.map(item => ({ ...item, sql: item.sql + '\n-- edited' })))).rejects.toThrow('Применённая миграция')
  await expect(migrate(database.pool, [])).rejects.toThrow('Применённая миграция')
})

it('отклоняет одинаковые имена и неотсортированный набор до SQL', async () => {
  const migration = { name: '900_probe.sql', sql: 'SELECT 1' }
  await expect(migrate(database.pool, [migration, migration])).rejects.toThrow('Неверный порядок')
  await expect(migrate(database.pool, [migration, { ...migration, name: '001_probe.sql' }])).rejects.toThrow('Неверный порядок')
})

it('откатывает DDL и историю при ошибке SQL', async () => {
  const migrations = await readMigrations()
  await expect(migrate(database.pool, [...migrations, { name: '900_fault.sql', sql: 'CREATE TABLE health.probe(id int); SELECT missing_column;' }])).rejects.toThrow()
  const result = await database.pool.query<Record<string, unknown>>("SELECT to_regclass('health.probe') AS name")
  expect(result.rows).toEqual([{ name: null }])
  expect(await migrate(database.pool, migrations)).toBe(migrations.length)
})

it('сериализует конкурентные запуски и сохраняет запись между соединениями', async () => {
  const migrations = [...await readMigrations(), { name: '900_probe.sql', sql: 'CREATE TABLE health.probe(id int PRIMARY KEY); INSERT INTO health.probe VALUES (1);' }]
  const counts = await Promise.all([migrate(database.pool, migrations), migrate(database.pool, migrations)])
  expect(counts.sort((a, b) => a - b)).toEqual([0, migrations.length])
  expect((await database.pool.query('SELECT id FROM health.probe')).rows).toEqual([{ id: 1 }])
})

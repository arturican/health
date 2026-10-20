// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Pool } from 'pg'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { testDatabase } from '../../tests/serverDatabase'
import { createAccount } from './accounts'
import { assertRuntimeRole } from './auth'
import { migrate, readMigrations } from './migrations'
import { seedDemo } from './seedRecords'
import { createSessions, tokenHash } from './sessions'
import { withUser } from './userTransaction'

const now = new Date('2026-10-20T12:00:00Z')
const credentials = { login: 'restore-demo', password: 'synthetic-restore-password', timezone: 'UTC' }

function command(program: string, args: string[], input?: Buffer, env = process.env) {
  try {
    return execFileSync(program, args, { input, env, stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000, maxBuffer: 20 * 1024 * 1024 })
  } catch { throw new Error('Синтетическая операция dump/GPG/restore завершилась ошибкой') }
}

function postgres(program: 'pg_dump' | 'pg_restore', name: string, input?: Buffer) {
  const url = new URL(z.string().parse(process.env.TEST_DATABASE_URL))
  if (url.pathname !== '/health_test' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !/^health_(test|restore)_[a-f0-9]{32}$/.test(name)) throw new Error('Требуется изолированная тестовая БД')
  const options = program === 'pg_dump' ? ['--format=custom'] : ['--exit-on-error', '--single-transaction']
  return command('docker', ['run', '--pull=never', '--rm', '-i', '--network=host', '--env', 'PGPASSWORD',
    'postgres:18.3', program, '--host', url.hostname.replaceAll('[', '').replaceAll(']', ''),
    '--port', url.port || '5432', '--username', decodeURIComponent(url.username), '--dbname', name, ...options],
  input, { ...process.env, PGPASSWORD: decodeURIComponent(url.password) })
}

async function fingerprints(pool: Pool) {
  const tables = z.array(z.object({ name: z.string().regex(/^[a-z_]+$/) })).parse((await pool.query(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname='health' ORDER BY tablename`)).rows)
  return Promise.all(tables.map(async ({ name }) => ({ name, rows: (await pool.query<Record<string, unknown>>(
    `SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text,E'\n'
     ORDER BY row_to_json(t)::text),'')) AS hash FROM health.${name} t`)).rows })))
}

async function permissions(pool: Pool) {
  return (await pool.query<Record<string, unknown>>(`SELECT relname,relrowsecurity,relforcerowsecurity,
    has_table_privilege('health_runtime',oid,'SELECT') AS can_read,
    has_table_privilege('health_runtime',oid,'INSERT') AS can_insert,
    has_table_privilege('health_runtime',oid,'DELETE') AS can_delete
    FROM pg_class WHERE relnamespace='health'::regnamespace AND relkind='r' ORDER BY relname`)).rows
}

it('восстанавливает зашифрованный dump со всеми данными, правами и отзывом доступа', async () => {
  const source = await testDatabase()
  try {
    const restored = await testDatabase('health_restore')
    try {
      const home = await mkdtemp(join(tmpdir(), 'health-synthetic-restore-'))
      try {
        const migrations = await readMigrations()
        await migrate(source.pool, migrations)
        const { account } = await seedDemo(source.pool, source.runtime, credentials, now)
        const other = await createAccount(source.pool, { ...credentials, login: 'restore-other' })
        const session = await (await createSessions(source.runtime)).login(
          { login: credentials.login, password: credentials.password }, null, now)
        expect(session).not.toBeNull()
        if (!session) throw new Error('Нет синтетической сессии')
        await source.pool.query(`INSERT INTO health.account_tokens VALUES
          ($1,$2,'reset_password','synthetic@example.test',$3,$4,NULL)`,
        [tokenHash('a'.repeat(64)), account.id, now, new Date(now.getTime() + 900000)])
        const baseline = await fingerprints(source.pool)
        expect(baseline).toHaveLength(20)
        const beforeRights = await permissions(source.pool)
        const sourceName = z.object({ name: z.string() }).parse(
          (await source.pool.query('SELECT current_database() AS name')).rows[0]).name
        const targetName = z.object({ name: z.string() }).parse(
          (await restored.pool.query('SELECT current_database() AS name')).rows[0]).name
        const gpg = (args: string[], input?: Buffer) => command('gpg', ['--homedir', home, '--batch', ...args], input)
        gpg(['--pinentry-mode', 'loopback', '--passphrase', '', '--quick-generate-key',
          'synthetic-restore@example.test', 'rsa2048', 'encr', '0'])
        const dump = postgres('pg_dump', sourceName)
        const encrypted = gpg(['--trust-model', 'always', '--recipient', 'synthetic-restore@example.test', '--encrypt'], dump)
        const damaged = Buffer.from(encrypted)
        damaged[damaged.length - 1] = (damaged.at(-1) ?? 0) ^ 1
        expect(() => gpg(['--decrypt'], damaged)).toThrow('Синтетическая операция')
        expect(() => postgres('pg_restore', targetName, Buffer.from('synthetic invalid dump'))).toThrow('Синтетическая операция')
        expect(await fingerprints(restored.pool)).toEqual([])
        const decrypted = gpg(['--decrypt'], encrypted)
        expect(decrypted.equals(dump)).toBe(true)
        postgres('pg_restore', targetName, decrypted)
        expect(await fingerprints(restored.pool)).toEqual(baseline)
        expect(await permissions(restored.pool)).toEqual(beforeRights)
        expect(await migrate(restored.pool, migrations)).toBe(0)
        await assertRuntimeRole(restored.runtime)
        const tables = z.array(z.object({ relname: z.string().regex(/^[a-z_]+$/) })).parse(
          (await restored.pool.query(`SELECT relname FROM pg_class
            WHERE relnamespace='health'::regnamespace AND relforcerowsecurity ORDER BY relname`)).rows)
        expect(tables).toHaveLength(15)
        for (const { relname } of tables) {
          expect(await withUser(restored.runtime, other, async client =>
            (await client.query(`SELECT 1 FROM health.${relname} WHERE user_id=$1`, [account.id])).rowCount)).toBe(0)
        }
        expect(await withUser(restored.runtime, account, async client =>
          (await client.query('SELECT 1 FROM health.files')).rowCount)).toBe(6)
        const sessions = await createSessions(restored.runtime)
        expect(await sessions.read(session.token, now)).not.toBeNull()
        const revoke = await readFile('deploy/revoke-restored-access.sql', 'utf8')
        await restored.pool.query(revoke)
        await restored.pool.query(revoke)
        expect(await sessions.read(session.token, now)).toBeNull()
        expect((await restored.pool.query('SELECT 1 FROM health.account_tokens')).rowCount).toBe(0)
        const persistent = (rows: Awaited<ReturnType<typeof fingerprints>>) => rows.filter(
          row => !['sessions', 'account_tokens'].includes(row.name))
        expect(persistent(await fingerprints(restored.pool))).toEqual(persistent(baseline))
        expect(await fingerprints(source.pool)).toEqual(baseline)
      } finally {
        try { command('gpgconf', ['--homedir', home, '--kill', 'all']) }
        finally { await rm(home, { recursive: true, force: true }) }
      }
    } finally { await restored.close() }
  } finally { await source.close() }
}, 60000)

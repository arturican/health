// @vitest-environment node
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { promisify } from 'node:util'
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { createAccount } from './accounts'
import { verifyRuntimeSurface } from '../../tests/runtimeSurface'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { testDatabase } from '../../tests/serverDatabase'
import { migrate, readMigrations } from './migrations'

function runtimeEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(DATABASE_URL|MIGRATION_DATABASE_URL|APP_ORIGIN|NODE_ENV|API_.*|MAIL_.*|ADMIN_.*)$/.test(key)))
  return { ...environment, NODE_ENV: 'test', MAIL_ENABLED: 'false', ...overrides }
}

async function waitForStartup(child: ReturnType<typeof spawn>, exited: Promise<unknown>) {
  if (!child.stdout) throw new Error('Нет stdout тестового API')
  const controller = new AbortController()
  try {
    await Promise.race([
      once(child.stdout, 'data', { signal: controller.signal }),
      exited.then(() => { throw new Error('API завершился до запуска') }),
    ])
  } finally { controller.abort() }
}

afterEach(() => { vi.unstubAllEnvs() })

beforeAll(async () => {
  await promisify(execFile)(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], { env: runtimeEnvironment() })
  await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.server.config.ts'], {
    env: runtimeEnvironment({ DATABASE_URL: 'postgresql://synthetic:secret-build-sentinel@localhost/health' }),
  })
}, 30000)

it('Node-сборка выполняет общую валидацию и не содержит реквизитов окружения', async () => {
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
    "const {diaryDate}=await import('./build-api/validation.js'); console.log(diaryDate('Europe/Moscow',new Date('2026-10-14T22:30:00Z')))" ], { env: runtimeEnvironment() })
  expect(result.stdout.trim()).toBe('2026-10-15')
  for (const name of await readdir('build-api', { recursive: true })) {
    if (name.endsWith('.js')) expect(await readFile(`build-api/${name}`, 'utf8')).not.toContain('secret-build-sentinel')
  }
})

async function reservePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Нет тестового порта')
  return { port: address.port, close: () => new Promise<void>((resolve, reject) => {
    server.close(error => { if (error) reject(error); else resolve() })
  }) }
}

it.each(['SIGTERM', 'SIGINT'] as const)('production API отвечает по HTTP и останавливается по %s', async signal => {
  const reserved = await reservePort()
  await reserved.close()
  const child = spawn(process.execPath, ['build-api/main.js'], {
    env: runtimeEnvironment({ API_HOST: '127.0.0.1', API_PORT: String(reserved.port) }), stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  try {
    await waitForStartup(child, exited)
    const response = await fetch(`http://127.0.0.1:${String(reserved.port)}/api/v1/health`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'ok' })
    const readiness = await fetch(`http://127.0.0.1:${String(reserved.port)}/api/v1/readiness`)
    expect(readiness.status).toBe(503)
    expect(await readiness.json()).toEqual({ status: 'unavailable' })
    child.kill(signal)
    expect(await exited).toEqual([0, null])
  } finally {
    if (child.exitCode === null) { child.kill('SIGKILL'); await exited }
  }
})

it('занятый порт завершает процесс с безопасной ошибкой', async () => {
  const reserved = await reservePort()
  try {
    await expect(promisify(execFile)(process.execPath, ['build-api/main.js'], {
      env: runtimeEnvironment({ API_PORT: String(reserved.port), API_HOST: '127.0.0.1' }),
    })).rejects.toMatchObject({ code: 1, stdout: '', stderr: 'Не удалось запустить API: проверьте серверные настройки и доступность порта\n' })
  } finally { await reserved.close() }
})

it('собранный production runtime проверяет62 операции и обнаруживает пропущенную регистрацию', async () => {
  const database = await testDatabase()
  try {
    await migrate(database.pool, await readMigrations())
    const reserved = await reservePort()
    await reserved.close()
    const child = spawn(process.execPath, ['build-api/main.js'], {
      env: runtimeEnvironment({ NODE_ENV: 'production', DATABASE_URL: database.runtime.options.connectionString,
        APP_ORIGIN: 'https://health.example.test', API_HOST: '127.0.0.1', API_PORT: String(reserved.port),
        MAIL_ENABLED: 'false' }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exited = once(child, 'exit')
    try {
      await waitForStartup(child, exited)
      const base = `http://127.0.0.1:${String(reserved.port)}`
      const origin = 'https://health.example.test'
      const credentials = { login: 'synthetic-runtime', password: 'synthetic-password-only', timezone: 'UTC' }
      const account = await createAccount(database.pool, credentials)
      const login = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ login: credentials.login, password: credentials.password }) })
      expect(login.status).toBe(200)
      const loggedIn: unknown = await login.json()
      const csrf = z.object({ csrf: z.string() }).parse(loggedIn).csrf
      const cookie = login.headers.get('set-cookie')
      if (!cookie) throw new Error('Нет синтетической сессии')
      const state = await fetch(base + '/api/v1/diary-state', { headers: { cookie } })
      const stateBody: unknown = await state.json()
      const diary = z.object({ generation: z.uuid(), changeRevision: z.number() }).parse(stateBody)
      const headers = { cookie, 'x-csrf-token': csrf, 'x-diary-generation': diary.generation }
      await verifyRuntimeSurface(base, origin, headers, account.id)
      expect((await database.pool.query('SELECT change_revision::int AS revision FROM health.settings')).rows).toEqual([{ revision: 0 }])
      for (const table of ['profiles', 'weights', 'products', 'food_entries', 'nutrition_days', 'steps', 'workouts', 'energy_plans', 'files', 'photos', 'documents', 'lab_results', 'commands']) {
        expect((await database.pool.query(`SELECT * FROM health.${table}`)).rowCount, table).toBe(0)
      }
      child.kill('SIGTERM')
      expect(await exited).toEqual([0, null])
      const temporary = await mkdtemp(join(tmpdir(), 'health-runtime-surface-'))
      try {
        await cp('build-api', join(temporary, 'build-api'), { recursive: true })
        await symlink(join(process.cwd(), 'node_modules'), join(temporary, 'node_modules'))
        await writeFile(join(temporary, 'package.json'), JSON.stringify({ type: 'module' }))
        const target = join(temporary, 'build-api/main.js')
        const source = await readFile(target, 'utf8')
        const call = 'registerDocuments(app, pool, authorize, uploads);'
        expect(source.split(call)).toHaveLength(2)
        const settingsCall = 'app.put("/api/v1/settings"'
        expect(source.split(settingsCall)).toHaveLength(2)
        const variants = [
          { code: source.replace(call, '/* Deliberately omitted by isolated smoke regression. */'), failure: 'GET /documents' },
          { code: source.replace(settingsCall, 'app.put("/api/v1/synthetic-unused-settings"'), failure: 'PUT /settings' },
        ]
        for (const variant of variants) {
          await writeFile(target, variant.code)
          const mutant = spawn(process.execPath, [target], {
            env: runtimeEnvironment({ NODE_ENV: 'production', DATABASE_URL: database.runtime.options.connectionString,
              APP_ORIGIN: origin, API_HOST: '127.0.0.1', API_PORT: String(reserved.port) }),
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          const mutantExited = once(mutant, 'exit')
          try {
            await waitForStartup(mutant, mutantExited)
            await expect(verifyRuntimeSurface(base, origin, headers, account.id)).rejects.toThrow(variant.failure)
            mutant.kill('SIGTERM')
            expect(await mutantExited).toEqual([0, null])
          } finally { if (mutant.exitCode === null) { mutant.kill('SIGKILL'); await mutantExited } }
        }
      } finally { await rm(temporary, { recursive: true, force: true }) }
    } finally {
      if (child.exitCode === null) { child.kill('SIGKILL'); await exited }
    }
  } finally { await database.close() }
}, 15000)

it('неверные настройки не открывают listener и не попадают в stderr', async () => {
  await expect(promisify(execFile)(process.execPath, ['build-api/main.js'], {
    env: runtimeEnvironment({ API_PORT: 'synthetic-secret' }),
  })).rejects.toMatchObject({ code: 1, stdout: '', stderr: 'Не удалось запустить API: проверьте серверные настройки и доступность порта\n' })
})

it('собранная seed CLI отклоняет неверную конфигурацию без утечки реквизитов', async () => {
  await expect(promisify(execFile)(process.execPath, ['build-api/seedDemo.js'], {
    env: runtimeEnvironment({ MIGRATION_DATABASE_URL: 'synthetic-secret-seed-sentinel' }),
  })).rejects.toMatchObject({ code: 1, stdout: '', stderr: 'Демонстрация не загружена: проверьте настройки, права ролей и отсутствие прежних данных дневника\n' })
})

it('no-DB runtime не наследует прикладное окружение родительского shell', async () => {
  let connections = 0
  const forbidden = createServer(socket => { connections++; socket.destroy() })
  forbidden.listen(0, '127.0.0.1')
  await once(forbidden, 'listening')
  const address = forbidden.address()
  if (!address || typeof address === 'string') throw new Error('Нет синтетического DB-порта')
  const reserved = await reservePort()
  await reserved.close()
  try {
    vi.stubEnv('DATABASE_URL', 'postgresql://synthetic:synthetic@127.0.0.1:' + String(address.port) + '/health')
    vi.stubEnv('MIGRATION_DATABASE_URL', 'synthetic-admin-sentinel')
    vi.stubEnv('APP_ORIGIN', 'https://health.example.test')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MAIL_ENABLED', 'true')
    vi.stubEnv('MAIL_SMTP_PORT', 'synthetic-invalid-port')
    vi.stubEnv('ADMIN_PASSWORD', 'synthetic-parent-sentinel')
    vi.stubEnv('API_TRUST_PROXY', 'synthetic-invalid-proxy')
    const child = spawn(process.execPath, ['build-api/main.js'], {
      env: runtimeEnvironment({ API_HOST: '127.0.0.1', API_PORT: String(reserved.port) }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exited = once(child, 'exit')
    try {
      await waitForStartup(child, exited)
      const response = await fetch('http://127.0.0.1:' + String(reserved.port) + '/api/v1/health')
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
      const readiness = await fetch('http://127.0.0.1:' + String(reserved.port) + '/api/v1/readiness')
      expect(readiness.status).toBe(503)
      expect(connections).toBe(0)
      child.kill('SIGTERM')
      expect(await exited).toEqual([0, null])
    } finally {
      if (child.exitCode === null) { child.kill('SIGKILL'); await exited }
    }
  } finally { await new Promise<void>(resolve => { forbidden.close(() => { resolve() }) }) }
})

it('ожидание запуска обнаруживает exit до первого stdout', async () => {
  const child = spawn(process.execPath, ['build-api/main.js'], {
    env: runtimeEnvironment({ API_PORT: 'synthetic-invalid-port' }), stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  try {
    await expect(waitForStartup(child, exited)).rejects.toThrow('API завершился до запуска')
    expect(await exited).toEqual([1, null])
  } finally {
    if (child.exitCode === null) { child.kill('SIGKILL'); await exited }
  }
})

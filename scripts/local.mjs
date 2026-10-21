import { existsSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const safeError = message => Object.assign(new Error(message), { safe: true })
const fail = message => { throw safeError(message) }
function captured(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, encoding: 'utf8' })
  if (result.status !== 0) fail(`Не выполнено ${command}: проверьте инструмент/доступ; секретный вывод скрыт.`)
  return result.stdout
}
function child(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { env, stdio: 'inherit' })
    process.on('error', () => reject(safeError(`Не удалось запустить ${command}`)))
    process.on('exit', code => code === 0 ? resolve() : reject(safeError(`Ошибка ${command}`)))
  })
}
function settings() {
  if (!existsSync('.env')) fail('Нет .env: выполните npm run secrets:restore с доступом к age key.')
  const secret = parseEnv(readFileSync('.env', 'utf8'))
  const keys = ['DEV_POSTGRES_PASSWORD', 'DEV_APP_PASSWORD', 'DEV_MIGRATOR_PASSWORD', 'DEV_DEMO_PASSWORD']
  if (Object.keys(secret).length !== keys.length || keys.some(key => !/^[A-Za-z0-9_-]{15,}$/.test(secret[key] ?? '') || secret[key].startsWith('REPLACE_'))) fail('Проверьте четыре DEV_* пароля в .env; шаблон не является настройкой.')
  const machine = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {}
  if (Object.keys(machine).some(key => !['DEV_DB_PORT', 'DEV_API_PORT', 'DEV_UI_PORT', 'DEV_CONTAINER'].includes(key))) fail('В .env.local допустимы только параметры из .env.local.example.')
  const port = (name, fallback) => {
    const value = machine[name] ?? fallback
    if (!/^\d+$/.test(value) || +value < 1024 || +value > 65535) fail(`Некорректный ${name}`)
    return value
  }
  const dbPort = port('DEV_DB_PORT', '55433')
  const apiPort = port('DEV_API_PORT', '3001')
  const uiPort = port('DEV_UI_PORT', '5173')
  if (new Set([dbPort, apiPort, uiPort]).size !== 3) fail('Порты БД/API/UI должны различаться.')
  const container = machine.DEV_CONTAINER ?? 'health-dev-local'
  if (!/^health-dev-[a-z0-9-]{1,45}$/.test(container)) fail('DEV_CONTAINER должен начинаться с health-dev- и содержать a-z/0-9/-.')
  const url = (user, password, database) => `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${dbPort}/${database}`
  return { secret, dbPort, apiPort, uiPort, container,
    admin: url('postgres', secret.DEV_POSTGRES_PASSWORD, 'postgres'),
    runtime: url('health_app', secret.DEV_APP_PASSWORD, 'health'),
    migration: url('health_migrator', secret.DEV_MIGRATOR_PASSWORD, 'health'),
    test: url('postgres', secret.DEV_POSTGRES_PASSWORD, 'health_test') }
}
function doctor() {
  if (process.platform !== 'linux' || process.arch !== 'x64') fail('Поддерживается Linux x86_64 / WSL2 Ubuntu 24.04.')
  if (process.version.slice(1) !== readFileSync('.nvmrc', 'utf8').trim()) fail('Выполните source ~/.nvm/nvm.sh; nvm install; nvm use.')
  if (captured('npm', ['--version']).trim() !== '11.19.1') fail('Нужен npm 11.19.1 из закреплённого Node.')
  for (const [tool, args] of [['git', ['--version']], ['sops', ['--version']], ['age-keygen', ['--version']], ['gpg', ['--version']], ['docker', ['info', '--format', '{{.ServerVersion}}']]]) captured(tool, args)
  captured('docker', ['image', 'inspect', 'postgres:18.3'])
  settings()
  process.stdout.write('Node/npm, SOPS/age, Git/GPG, Docker/postgres:18.3 и конфигурация OK. Браузер: npx playwright install chromium.\n')
}
async function withDatabase(url, work) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 2000 })
  try { await client.connect(); return await work(client) } finally { await client.end() }
}
async function up(config) {
  const { container, dbPort } = config
  const volume = `${container}-data`
  const label = 'io.health-diary.local'
  const inspected = spawnSync('docker', ['container', 'inspect', container], { encoding: 'utf8' })
  if (inspected.status === 0) {
    const info = JSON.parse(inspected.stdout)[0]
    const binding = info.HostConfig.PortBindings?.['5432/tcp']
    if (info.Config.Labels?.[label] !== '1' || info.Config.Image !== 'postgres:18.3' || binding?.length !== 1 || binding[0].HostIp !== '127.0.0.1' || binding[0].HostPort !== dbPort || !info.Mounts.some(mount => mount.Name === volume && mount.Destination === '/var/lib/postgresql')) fail('Контейнер существует с другой конфигурацией; ничего не изменено. Выберите другое DEV_CONTAINER/порты.')
    if (!info.State.Running) captured('docker', ['start', container])
  } else {
    const found = spawnSync('docker', ['volume', 'inspect', volume], { encoding: 'utf8' })
    if (found.status === 0 && JSON.parse(found.stdout)[0].Labels?.[label] !== '1') fail('Том принадлежит другой конфигурации; выберите другое DEV_CONTAINER.')
    if (found.status !== 0) captured('docker', ['volume', 'create', '--label', `${label}=1`, volume])
    captured('docker', ['run', '--detach', '--pull=never', '--name', container, '--label', `${label}=1`,
      '--publish', `127.0.0.1:${dbPort}:5432`, '--mount', `type=volume,src=${volume},dst=/var/lib/postgresql`,
      '--env', 'POSTGRES_PASSWORD', 'postgres:18.3', '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic'],
    { ...process.env, POSTGRES_PASSWORD: config.secret.DEV_POSTGRES_PASSWORD })
  }
  const deadline = Date.now() + 30000
  while (true) {
    try { await withDatabase(config.admin, client => client.query('SELECT 1')); break }
    catch { if (Date.now() >= deadline) fail('PostgreSQL недоступен или пароль отличается. Данные/пароли не менялись; проверьте .env и порт.'); await delay(200) }
  }
  await withDatabase(config.admin, async client => {
    await client.query('SELECT pg_advisory_lock(1729, 263); BEGIN; SELECT pg_advisory_xact_lock(1729, 161)')
    const previous = await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('health_app', 'health_migrator')")
    await client.query(readFileSync('deploy/database-roles.sql', 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''))
    for (const [role, password] of [['health_app', config.secret.DEV_APP_PASSWORD], ['health_migrator', config.secret.DEV_MIGRATOR_PASSWORD]]) {
      if (!previous.rows.some(row => row.rolname === role)) {
        const statement = await client.query("SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql", [role, password])
        await client.query(statement.rows[0].sql)
      }
    }
    await client.query('COMMIT')
    for (const database of ['health', 'health_test']) {
      const found = await client.query('SELECT datname FROM pg_database WHERE datname=$1', [database])
      if (!found.rowCount) await client.query(`CREATE DATABASE ${database} OWNER ${database === 'health' ? 'health_migrator' : 'postgres'}`)
    }
    await client.query('REVOKE ALL ON DATABASE health FROM PUBLIC; GRANT CONNECT ON DATABASE health TO health_app, health_migrator')
  })
  for (const url of [config.runtime, config.migration]) await withDatabase(url, client => client.query('SELECT 1'))
  process.stdout.write(`PostgreSQL готов: ${container}, loopback ${dbPort}; существующие данные и пароли сохранены.\n`)
}
async function main() {
  const command = process.argv[2]
  if (command === 'doctor') return doctor()
  const config = settings()
  const env = { ...process.env, NODE_ENV: 'development', MAIL_ENABLED: 'false', API_TRUST_PROXY: 'false',
    API_HOST: '127.0.0.1', API_PORT: config.apiPort, APP_ORIGIN: `http://127.0.0.1:${config.uiPort}`, DATABASE_URL: config.runtime }
  delete env.MIGRATION_DATABASE_URL
  delete env.ADMIN_PASSWORD
  if (command === 'setup') {
    doctor()
    await up(config)
    await child('npm', ['run', 'build:api'])
    await child(process.execPath, ['build-api/migrate.js'], { ...env, MIGRATION_DATABASE_URL: config.migration })
    await child(process.execPath, ['build-api/seedDemo.js'], { ...env, MIGRATION_DATABASE_URL: config.migration,
      ADMIN_LOGIN: 'local-demo', ADMIN_PASSWORD: config.secret.DEV_DEMO_PASSWORD, ADMIN_TIMEZONE: 'Europe/Moscow' })
  } else if (command === 'api') {
    await child('npm', ['run', 'build:api'])
    await child(process.execPath, ['build-api/main.js'], env)
  } else if (command === 'ui') {
    await child('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', config.uiPort, '--strictPort'],
      { ...process.env, HEALTH_API_PROXY: `http://127.0.0.1:${config.apiPort}` })
  } else if (command === 'check') {
    await withDatabase(config.test, client => client.query('SELECT 1'))
    await child('npm', ['run', 'check'], { ...process.env, TEST_DATABASE_URL: config.test })
  } else fail('Команды: doctor | setup | api | ui | check')
}
main().catch(error => {
  process.stderr.write(`${error.safe ? error.message : 'Ошибка локальной БД/файла: проверьте .env/.env.local и права; значения и ошибки БД скрыты. Данные не удалялись.'}\n`)
  process.exitCode = 1
})

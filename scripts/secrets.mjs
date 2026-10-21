import { createHash, randomBytes } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
process.umask(0o077)
const cipher = 'secrets/development.enc.env'
const stateFile = '.secrets-state.json'
const names = ['DEV_POSTGRES_PASSWORD', 'DEV_APP_PASSWORD', 'DEV_MIGRATOR_PASSWORD', 'DEV_DEMO_PASSWORD']
const key = resolve(process.env.SOPS_AGE_KEY_FILE ?? join(homedir(), '.config/sops/age/keys.txt'))
const hash = value => createHash('sha256').update(value).digest('hex')
const read = path => readFileSync(path, 'utf8')
const fail = message => { throw new Error(message) }

function run(command, args, input) {
  const result = spawnSync(command, args, {
    input, encoding: 'utf8', env: { ...process.env, SOPS_AGE_KEY_FILE: key },
    maxBuffer: 1024 * 1024, timeout: 45000,
  })
  if (result.status !== 0 && command === 'ssh') fail('Нет SSH-доступа к development secrets: проверьте авторизацию ключа и host key. .env сохранён.')
  if (result.status !== 0) fail(`Ошибка ${command}: проверьте установку, ключ и входной файл; настройки сохранены.`)
  return result.stdout
}

function localBackend() {
  const backend = process.env.HEALTH_SECRETS_BACKEND ?? 'ssh'
  if (!['ssh', 'local'].includes(backend)) fail('HEALTH_SECRETS_BACKEND: ssh или local.')
  return backend === 'local'
}

function remote(operation, input) {
  const config = JSON.parse(read('config/development-secrets.json'))
  if (!config || !/^health-dev-secrets@[a-zA-Z0-9.-]+$/.test(config.destination ?? '') || config.knownHostsFile !== 'config/development-secrets.known_hosts') fail('Некорректная конфигурация development SSH.')
  const identity = process.env.HEALTH_SECRETS_IDENTITY
  return run('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${resolve(config.knownHostsFile)}`, '-o', 'ForwardAgent=no',
    '-o', 'ClearAllForwardings=yes', '-o', 'ConnectTimeout=10',
    ...(identity ? ['-o', 'IdentitiesOnly=yes', '-i', resolve(identity)] : []), config.destination, operation], input)
}

function checkKeyLocation() {
  let ancestor = key
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const canonical = resolve(realpathSync(ancestor), relative(ancestor, key))
  const root = realpathSync(process.cwd())
  if (canonical === root || canonical.startsWith(`${root}/`)) fail('Ключ должен находиться вне репозитория.')
}

function requireKey() {
  checkKeyLocation()
  if (!existsSync(key)) fail(`Нет ключа: установите резервную копию в ${key} (chmod 600).`)
  if (!statSync(key).isFile()) fail('Ключ должен быть обычным файлом.')
  if (statSync(key).mode & 0o077) fail(`Слишком открытые права ключа: chmod 600 ${key}`)
}

function validate(value) {
  const env = parseEnv(value)
  if (Object.keys(env).length !== names.length || names.some(name => !/^[A-Za-z0-9_-]{15,}$/.test(env[name] ?? ''))) {
    fail('Нужны четыре DEV_*_PASSWORD из .env.example: минимум 15 символов A-Z, a-z, 0-9, _ или -.')
  }
  if (Object.keys(env).some(name => !names.includes(name))) fail('В файле есть посторонние настройки; production не переносится.')
  return names.map(name => `${name}=${env[name]}`).join('\n') + '\n'
}

function atomic(path, value, replace = true) {
  const temp = `.secrets-write-${randomBytes(12).toString('hex')}`
  try {
    writeFileSync(temp, value, { mode: 0o600, flag: 'wx' })
    if (replace) renameSync(temp, path)
    else linkSync(temp, path)
  } finally { rmSync(temp, { force: true }) }
}

function decrypt() {
  if (!localBackend()) return validate(remote('decrypt-development', read(cipher)))
  requireKey()
  return validate(run('sops', ['--decrypt', '--input-type', 'dotenv', '--output-type', 'dotenv', cipher]))
}

function saveState() {
  atomic(stateFile, JSON.stringify({ cipher: hash(read(cipher)), plain: hash(read('.env')) }) + '\n')
}

function restore(refresh = false) {
  if (existsSync('.env') && !refresh) {
    process.stdout.write('.env уже существует и сохранён. Для обновления неизменённого файла: secrets:refresh.\n')
    return
  }
  if (refresh) {
    if (!existsSync(stateFile) || !existsSync('.env')) fail('Нет локальной отметки восстановления; сначала разрешите различия вручную.')
    const state = JSON.parse(read(stateFile))
    if (state.plain !== hash(read('.env'))) fail('.env изменён локально; refresh отменён. Сначала сохраните/объедините секреты.')
  }
  const value = decrypt()
  atomic('.env', value, refresh)
  saveState()
  process.stdout.write('Настройки восстановлены в .env (600); .env.local сохранён.\n')
}

function checkRemote() {
  run('git', ['fetch', 'origin'])
  const upstream = spawnSync('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], { encoding: 'utf8' })
  if (upstream.status !== 0) fail('Сначала задайте upstream ветки и получите изменения Git; затем повторите шифрование.')
  const newer = run('git', ['log', `HEAD..${upstream.stdout.trim()}`, '--format=%H', '--', '.sops.yaml', cipher])
  if (newer.trim()) fail('В upstream есть новые настройки. Сначала git pull --ff-only и объединение секретов.')
}

function encrypt(reconcile = false) {
  checkRemote()
  decrypt()
  if (!reconcile) {
    if (!existsSync(stateFile)) fail('Нет отметки версии: восстановите настройки или выполните явное secrets:reconcile после проверки различий.')
    if (JSON.parse(read(stateFile)).cipher !== hash(read(cipher))) fail('Зашифрованный файл обновился. Объедините секреты, затем secrets:reconcile.')
  }
  const value = validate(read('.env'))
  const encrypted = localBackend()
    ? run('sops', ['encrypt', '--input-type', 'dotenv', '--output-type', 'dotenv', '--filename-override', cipher], value)
    : remote('encrypt-development', value)
  if (!encrypted.includes('sops_mac=') || !encrypted.includes('ENC[AES256_GCM,')) fail('Не получен зашифрованный файл.')
  if (Object.values(parseEnv(value)).some(password => encrypted.includes(password))) fail('Backend вернул открытое значение; encrypted файл сохранён.')
  atomic(cipher, encrypted)
  saveState()
  process.stdout.write('Зашифрованный файл обновлён; проверьте и закоммитьте только ciphertext.\n')
}

function init() {
  if (existsSync(cipher)) return restore()
  if (!localBackend()) fail('Новый набор создаёт оператор с HEALTH_SECRETS_BACKEND=local; существующий набор получает secrets:restore.')
  if (existsSync('.env')) fail('Существующий .env сохранён. Первичная настройка требует отдельной проверки его назначения.')
  if (!existsSync(key)) {
    checkKeyLocation()
    mkdirSync(dirname(key), { recursive: true, mode: 0o700 })
    run('age-keygen', ['-o', key])
  }
  requireKey()
  const recipient = run('age-keygen', ['-y', key]).trim()
  if (!/^age1[a-z0-9]+$/.test(recipient)) fail('Нужен обычный age recipient.')
  if (!existsSync('.sops.yaml')) {
    atomic('.sops.yaml', `creation_rules:\n  - path_regex: secrets/development\\.enc\\.env$\n    age: ${recipient}\n`, false)
  }
  const value = names.map(name => `${name}=${randomBytes(32).toString('base64url')}`).join('\n') + '\n'
  const encrypted = run('sops', ['encrypt', '--input-type', 'dotenv', '--output-type', 'dotenv', '--filename-override', cipher], value)
  mkdirSync('secrets', { recursive: true })
  atomic(cipher, encrypted, false)
  restore()
  process.stdout.write(`Ключ: ${key}. Сделайте защищённую резервную копию самостоятельно.\n`)
}

let locked = false
try {
  mkdirSync('.secrets.lock', { mode: 0o700 })
  locked = true
  const command = process.argv[2]
  if (command === 'init') init()
  else if (command === 'restore') restore()
  else if (command === 'refresh') restore(true)
  else if (command === 'encrypt') encrypt()
  else if (command === 'reconcile') encrypt(true)
  else fail('Команды: init | restore | refresh | encrypt | reconcile')
} catch (error) {
  process.stderr.write(`${error.code === 'EEXIST' ? 'Операция уже выполняется или файл существует; настройки сохранены.' : error.message}\n`)
  process.exitCode = 1
} finally {
  if (locked) rmSync('.secrets.lock', { recursive: true })
}

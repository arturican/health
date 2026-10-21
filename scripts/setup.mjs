import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', () => reject(new Error(`Не найден ${command}`)))
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Не выполнено ${command}; исправьте указанную ошибку и повторите setup.`)))
  })
}
function dependenciesMatch() {
  try {
    const expected = JSON.parse(readFileSync('package-lock.json', 'utf8')).packages
    const installed = JSON.parse(readFileSync('node_modules/.package-lock.json', 'utf8')).packages
    for (const [path, entry] of Object.entries(expected)) {
      if (!path || (!installed[path] && entry.optional)) continue
      if (!existsSync(`${path}/package.json`) || installed[path]?.version !== entry.version || installed[path]?.integrity !== entry.integrity) return false
    }
    return Object.keys(installed).every(path => expected[path])
  } catch { return false }
}
let locked = false
try {
  if (process.version.slice(1) !== readFileSync('.nvmrc', 'utf8').trim()) throw new Error('Сначала source ~/.nvm/nvm.sh; nvm install; nvm use.')
  mkdirSync('.secrets-setup.lock')
  locked = true
  if (!dependenciesMatch()) await run('npm', ['ci'])
  else process.stdout.write('Зависимости соответствуют lockfile; установка не требуется.\n')
  const state = existsSync('.secrets-state.json') ? JSON.parse(readFileSync('.secrets-state.json', 'utf8')) : null
  const hash = createHash('sha256').update(readFileSync('secrets/development.enc.env')).digest('hex')
  const refresh = existsSync('.env') && state && state.cipher !== hash
  await run('npm', ['run', refresh ? 'secrets:refresh' : 'secrets:restore'])
  const docker = spawnSync('docker', ['image', 'inspect', 'postgres:18.3'], { stdio: 'ignore' })
  if (docker.status !== 0) await run('docker', ['pull', 'postgres:18.3'])
  await run(process.execPath, ['scripts/local.mjs', 'setup'])
  process.stdout.write('Готово. API: npm run local:api; второй терминал: npm run local:ui.\n')
} catch (error) {
  process.stderr.write(`${error.code === 'EEXIST' ? 'Другой setup уже выполняется; конфигурация сохранена.' : error.message}\n`)
  process.exitCode = 1
} finally { if (locked) rmSync('.secrets-setup.lock', { recursive: true }) }

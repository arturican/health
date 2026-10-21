import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('SOPS: restore, refresh, errors, stale updates and key reuse preserve settings', () => {
  const temp = mkdtempSync(join(tmpdir(), 'health-secrets-test-'))
  const remote = join(temp, 'remote.git')
  const work = join(temp, 'work')
  const key = join(temp, 'private/keys.txt')
  const env = { ...process.env, SOPS_AGE_KEY_FILE: key, HEALTH_SECRETS_BACKEND: 'local' }
  function execute(command, args, cwd = work, extraEnv = {}) {
    return spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' })
  }
  function ok(command, args, cwd) {
    const r = execute(command, args, cwd)
    assert.equal(r.status, 0, `${command} failed (output intentionally hidden)`)
  }
  const git = args => ok('git', args)
  const secrets = (command, extraEnv) => execute(process.execPath, ['scripts/secrets.mjs', command], work, extraEnv)
  function commit(paths) {
    git(['add', '--', ...paths])
    git(['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.test', 'commit', '-m', 'synthetic fixture'])
  }
  try {
    ok('git', ['init', '--bare', '--initial-branch=main', remote], temp)
    ok('git', ['clone', remote, work], temp)
    mkdirSync(join(work, 'scripts'))
    copyFileSync(new URL('./secrets.mjs', import.meta.url), join(work, 'scripts/secrets.mjs'))
    copyFileSync(new URL('../.gitignore', import.meta.url), join(work, '.gitignore'))
    commit(['scripts/secrets.mjs', '.gitignore'])
    git(['push', '-u', 'origin', 'main'])
    symlinkSync(work, join(temp, 'repo-link'))
    assert.equal(secrets('init', { SOPS_AGE_KEY_FILE: join(temp, 'repo-link/private/key.txt') }).status, 1)
    assert.equal(execute('test', ['-e', 'private/key.txt']).status, 1)
    assert.equal(secrets('init').status, 0)
    const original = readFileSync(join(work, '.env'))
    const originalKey = readFileSync(key)
    assert.equal(statSync(key).mode & 0o777, 0o600)
    assert.equal(statSync(join(work, '.env')).mode & 0o777, 0o600)
    const encrypted = readFileSync(join(work, 'secrets/development.enc.env'))
    for (const line of original.toString().trim().split('\n')) {
      assert.equal(encrypted.includes(line.split('=')[1]), false, 'ciphertext must hide each password')
    }
    commit(['.sops.yaml', 'secrets/development.enc.env'])
    git(['push'])
    assert.equal(secrets('init').status, 0)
    assert.deepEqual(readFileSync(key), originalKey)
    assert.deepEqual(readFileSync(join(work, '.env')), original)
    rmSync(join(work, '.env'))
    const missing = secrets('restore', { SOPS_AGE_KEY_FILE: join(temp, 'missing') })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /Нет ключа/)
    assert.equal(secrets('restore').status, 0)
    assert.deepEqual(readFileSync(join(work, '.env')), original)
    writeFileSync(join(work, '.env.local'), 'DEV_API_PORT=43210\n')
    writeFileSync(join(work, '.env'), original.toString().replace(/DEV_DEMO_PASSWORD=.*/, 'DEV_DEMO_PASSWORD=synthetic-changed-password'))
    const changed = readFileSync(join(work, '.env'))
    assert.equal(secrets('restore').status, 0)
    assert.equal(secrets('refresh').status, 1)
    assert.deepEqual(readFileSync(join(work, '.env')), changed)
    assert.equal(secrets('encrypt').status, 0)
    writeFileSync(join(work, '.env'), readFileSync(join(work, '.env'), 'utf8') + '# private comment must not reach Git\n')
    assert.equal(secrets('encrypt').status, 0)
    assert.equal(readFileSync(join(work, 'secrets/development.enc.env'), 'utf8').includes('private comment'), false)
    writeFileSync(join(work, '.env'), changed)
    assert.equal(secrets('encrypt').status, 0)
    assert.equal(secrets('refresh').status, 0)
    assert.deepEqual(readFileSync(join(work, '.env')), changed)
    assert.equal(readFileSync(join(work, '.env.local'), 'utf8'), 'DEV_API_PORT=43210\n')
    const currentCipher = readFileSync(join(work, 'secrets/development.enc.env'))
    writeFileSync(join(work, 'secrets/development.enc.env'), 'damaged ciphertext\n')
    assert.equal(secrets('refresh').status, 1)
    assert.deepEqual(readFileSync(join(work, '.env')), changed)
    rmSync(join(work, '.env'))
    assert.equal(secrets('restore').status, 1)
    assert.equal(execute('test', ['-e', '.env']).status, 1)
    writeFileSync(join(work, '.env'), changed, { mode: 0o600 })
    writeFileSync(join(work, 'secrets/development.enc.env'), currentCipher)
    writeFileSync(join(work, '.secrets-state.json'), '{"cipher":"stale"}')
    assert.equal(secrets('encrypt').status, 1)
    assert.equal(secrets('reconcile').status, 0)
    commit(['secrets/development.enc.env'])
    git(['push'])
    const other = join(temp, 'other')
    ok('git', ['clone', remote, other], temp)
    writeFileSync(join(other, 'secrets/development.enc.env'), 'new remote version\n')
    ok('git', ['add', 'secrets/development.enc.env'], other)
    ok('git', ['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.test', 'commit', '-m', 'remote fixture'], other)
    ok('git', ['push'], other)
    const stale = secrets('encrypt')
    assert.equal(stale.status, 1)
    assert.match(stale.stderr, /upstream/)
    assert.deepEqual(readFileSync(join(work, '.env')), changed)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

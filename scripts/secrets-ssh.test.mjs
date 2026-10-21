import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('SSH secrets work without local crypto and preserve settings on transport/schema/stale errors', () => {
  const temp = mkdtempSync(join(tmpdir(), 'health-secrets-ssh-test-'))
  const work = join(temp, 'work')
  const remote = join(temp, 'remote.git')
  const bin = join(temp, 'bin')
  const argsFile = join(temp, 'ssh-args.json')
  const plain = ['DEV_POSTGRES_PASSWORD', 'DEV_APP_PASSWORD', 'DEV_MIGRATOR_PASSWORD', 'DEV_DEMO_PASSWORD']
    .map(name => `${name}=synthetic-password-only`).join('\n') + '\n'
  const env = { ...process.env, HEALTH_SECRETS_BACKEND: 'ssh', SOPS_AGE_KEY_FILE: join(temp, 'missing-private-key'),
    PATH: `${bin}:${process.env.PATH}`, FIXTURE_PLAIN: plain, FIXTURE_ARGS: argsFile, FIXTURE_CIPHER: join(work, 'secrets/development.enc.env') }
  function run(command, args, cwd = work, extra = {}) {
    return spawnSync(command, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8' })
  }
  function git(args, cwd) { assert.equal(run('git', args, cwd).status, 0, 'fixture Git command failed') }
  const secrets = (command, extra) => run(process.execPath, ['scripts/secrets.mjs', command], work, extra)
  try {
    mkdirSync(bin)
    git(['init', '--bare', '--initial-branch=main', remote], temp)
    git(['clone', remote, work], temp)
    for (const directory of ['scripts', 'config', 'secrets']) mkdirSync(join(work, directory))
    for (const path of ['scripts/secrets.mjs', 'config/development-secrets.json', 'config/development-secrets.known_hosts', 'secrets/development.enc.env', '.gitignore']) {
      copyFileSync(new URL(`../${path}`, import.meta.url), join(work, path))
    }
    git(['add', '--', 'scripts/secrets.mjs', 'config/development-secrets.json', 'config/development-secrets.known_hosts', 'secrets/development.enc.env', '.gitignore'])
    git(['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.test', 'commit', '-m', 'fixture'])
    git(['push', '-u', 'origin', 'main'])
    const executable = (name, body) => {
      const path = join(bin, name)
      writeFileSync(path, `#!${process.execPath}\n${body}\n`)
      chmodSync(path, 0o755)
    }
    executable('sops', 'process.exit(99)')
    executable('age-keygen', 'process.exit(99)')
    executable('ssh', `const fs = require('node:fs');
fs.writeFileSync(process.env.FIXTURE_ARGS, JSON.stringify(process.argv.slice(2)));
if (process.env.FIXTURE_FAIL) { process.stdout.write(process.env.FIXTURE_PLAIN); process.stderr.write('sensitive-synthetic-error'); process.exit(255); }
if (process.env.FIXTURE_UNKNOWN) { process.stdout.write('PRODUCTION_PASSWORD=synthetic-password-only'); process.exit(0); }
if (process.env.FIXTURE_MIXED) { process.stdout.write(fs.readFileSync(process.env.FIXTURE_CIPHER) + process.env.FIXTURE_PLAIN); process.exit(0); }
process.stdout.write(process.argv.at(-1) === 'encrypt-development' ? fs.readFileSync(process.env.FIXTURE_CIPHER) : process.env.FIXTURE_PLAIN);`)
    assert.equal(secrets('restore').status, 0)
    assert.equal(readFileSync(join(work, '.env'), 'utf8'), plain)
    assert.equal(existsSync(env.SOPS_AGE_KEY_FILE), false)
    const args = JSON.parse(readFileSync(argsFile, 'utf8'))
    assert.ok(args.includes('StrictHostKeyChecking=yes'))
    assert.ok(args.includes('BatchMode=yes'))
    assert.ok(args.includes('ClearAllForwardings=yes'))
    assert.equal(args.some(value => value.includes('synthetic-password-only')), false)
    writeFileSync(join(work, '.env.local'), 'DEV_API_PORT=23003\n')
    rmSync(argsFile)
    assert.equal(secrets('restore', { FIXTURE_FAIL: '1' }).status, 0)
    assert.equal(existsSync(argsFile), false)
    const failed = secrets('refresh', { FIXTURE_FAIL: '1' })
    assert.equal(failed.status, 1)
    assert.equal(failed.stderr.includes('sensitive-synthetic-error'), false)
    assert.equal(readFileSync(join(work, '.env'), 'utf8'), plain)
    rmSync(join(work, '.env'))
    assert.equal(secrets('restore', { FIXTURE_FAIL: '1' }).status, 1)
    assert.equal(existsSync(join(work, '.env')), false)
    assert.equal(secrets('restore', { FIXTURE_UNKNOWN: '1' }).status, 1)
    assert.equal(existsSync(join(work, '.env')), false)
    assert.equal(secrets('restore').status, 0)
    writeFileSync(join(work, '.env'), plain.replace('synthetic-password-only', 'synthetic-changed-password'))
    rmSync(argsFile)
    assert.equal(secrets('refresh').status, 1)
    assert.equal(existsSync(argsFile), false)
    assert.equal(secrets('encrypt').status, 0)
    assert.equal(JSON.parse(readFileSync(argsFile, 'utf8')).at(-1), 'encrypt-development')
    const cipherBefore = readFileSync(join(work, 'secrets/development.enc.env'))
    assert.equal(secrets('encrypt', { FIXTURE_MIXED: '1' }).status, 1)
    assert.deepEqual(readFileSync(join(work, 'secrets/development.enc.env')), cipherBefore)
    writeFileSync(join(work, 'secrets/development.enc.env'), readFileSync(join(work, 'secrets/development.enc.env'), 'utf8') + '# updated\n')
    assert.equal(secrets('encrypt').status, 1)
    assert.equal(readFileSync(join(work, '.env.local'), 'utf8'), 'DEV_API_PORT=23003\n')
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('grant requires a public-key file before invoking operator SSH', () => {
  const result = spawnSync(process.execPath, ['scripts/grant-development-access.mjs', '/tmp/private-key'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /public key/)
})

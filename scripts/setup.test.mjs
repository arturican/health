import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('setup installs only changed dependencies, selects safe refresh and stops on secret failure', () => {
  const temp = mkdtempSync(join(tmpdir(), 'health-setup-test-'))
  try {
    for (const path of ['scripts', 'secrets', 'bin']) mkdirSync(join(temp, path))
    copyFileSync(new URL('./setup.mjs', import.meta.url), join(temp, 'scripts/setup.mjs'))
    writeFileSync(join(temp, '.nvmrc'), process.version.slice(1))
    writeFileSync(join(temp, 'secrets/development.enc.env'), 'synthetic ciphertext')
    const log = join(temp, 'commands.log')
    const executable = (name, source) => {
      const path = join(temp, 'bin', name)
      writeFileSync(path, `#!${process.execPath}\n${source}`)
      chmodSync(path, 0o755)
    }
    executable('docker', 'process.exit(0)')
    executable('npm', `const fs=require('node:fs');const args=process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify(args)+'\\n');
if(args[0]==='ci'){
 const packages=JSON.parse(fs.readFileSync('package-lock.json')).packages;
 fs.mkdirSync('node_modules/a',{recursive:true});fs.writeFileSync('node_modules/a/package.json','{}');
 fs.writeFileSync('node_modules/.package-lock.json',JSON.stringify({packages}));
}
if(args[1]==='secrets:refresh'&&process.env.FIXTURE_FAIL)process.exit(1);
`)
    writeFileSync(join(temp, 'scripts/local.mjs'), `import {writeFileSync} from 'node:fs';writeFileSync('local-called','yes')`)
    const lock = version => writeFileSync(join(temp, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/a': { version, integrity: `synthetic-${version}` } } }))
    const run = extra => spawnSync(process.execPath, ['scripts/setup.mjs'], { cwd: temp,
      env: { ...process.env, PATH: `${join(temp, 'bin')}:${process.env.PATH}`, FIXTURE_LOG: log, ...extra }, encoding: 'utf8' })
    const calls = () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    lock('1.0.0')
    assert.equal(run().status, 0)
    assert.deepEqual(calls(), [['ci'], ['run', 'secrets:restore']])
    writeFileSync(log, '')
    assert.equal(run().status, 0)
    assert.deepEqual(calls(), [['run', 'secrets:restore']])
    lock('2.0.0')
    writeFileSync(log, '')
    assert.equal(run().status, 0)
    assert.equal(calls()[0][0], 'ci')
    writeFileSync(join(temp, '.env'), 'synthetic existing settings')
    writeFileSync(join(temp, '.env.local'), 'synthetic local settings')
    writeFileSync(join(temp, '.secrets-state.json'), '{"cipher":"older version"}')
    writeFileSync(log, '')
    rmSync(join(temp, 'local-called'))
    assert.equal(run({ FIXTURE_FAIL: '1' }).status, 1)
    assert.deepEqual(calls(), [['run', 'secrets:refresh']])
    assert.equal(existsSync(join(temp, 'local-called')), false)
    assert.equal(existsSync(join(temp, '.secrets-setup.lock')), false)
    assert.equal(readFileSync(join(temp, '.env'), 'utf8'), 'synthetic existing settings')
    assert.equal(readFileSync(join(temp, '.env.local'), 'utf8'), 'synthetic local settings')
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

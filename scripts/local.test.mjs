import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('local commands reject missing, placeholder and conflicting configuration before services', () => {
  const temp = mkdtempSync(join(tmpdir(), 'health-local-config-test-'))
  try {
    mkdirSync(join(temp, 'scripts'))
    copyFileSync(new URL('./local.mjs', import.meta.url), join(temp, 'scripts/local.mjs'))
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(temp, 'node_modules'))
    const run = () => spawnSync(process.execPath, ['scripts/local.mjs', 'api'], { cwd: temp, encoding: 'utf8' })
    let result = run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /npm run setup/)
    const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
    writeFileSync(join(temp, '.env'), example)
    result = run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /DEV_/)
    writeFileSync(join(temp, '.env'), example.replaceAll('REPLACE_WITH_ENCRYPTED_VALUE', 'synthetic-password-only'))
    for (const invalid of ['DATABASE_URL=forbidden', 'DEV_API_PORT=55433', 'DEV_DB_PORT=0', 'DEV_CONTAINER=production']) {
      writeFileSync(join(temp, '.env.local'), invalid)
      result = run()
      assert.equal(result.status, 1)
      assert.equal(result.stderr.includes('synthetic-password-only'), false)
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

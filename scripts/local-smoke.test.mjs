import assert from 'node:assert/strict'
import { openSync, closeSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseEnv } from 'node:util'
import { test } from 'node:test'
import { Client } from 'pg'

test('isolated local setup preserves tables and serves API/UI with synthetic authentication', async () => {
  const secret = parseEnv(readFileSync('.env', 'utf8'))
  const local = parseEnv(readFileSync('.env.local', 'utf8'))
  // Explicit settings required: this smoke must never reuse the ordinary ports/container.
  assert.match(local.DEV_CONTAINER ?? '', /^health-dev-smoke-/)
  const dbPort = Number(local.DEV_DB_PORT)
  const apiPort = Number(local.DEV_API_PORT)
  const uiPort = Number(local.DEV_UI_PORT)
  assert.ok([dbPort, apiPort, uiPort].every(port => port >= 20000 && port <= 65535))
  const client = new Client({ host: '127.0.0.1', port: dbPort, user: 'postgres', password: secret.DEV_POSTGRES_PASSWORD, database: 'health' })
  await client.connect()
  const children = []
  const log = openSync(join(tmpdir(), `health-local-smoke-${process.pid}.log`), 'w', 0o600)
  const sentinel = `node_modules/.health-setup-smoke-${process.pid}`
  async function snapshot() {
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='health' ORDER BY tablename")
    assert.ok(tables.rowCount >= 20)
    const state = {}
    for (const { tablename } of tables.rows) {
      assert.match(tablename, /^[a-z_]+$/)
      state[tablename] = (await client.query(`SELECT count(*)::int AS count, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) AS hash FROM health.${tablename} t`)).rows[0]
    }
    return state
  }
  try {
    const before = await snapshot()
    writeFileSync(sentinel, 'synthetic marker', { flag: 'wx' })
    assert.equal(spawnSync('npm', ['run', 'setup'], { stdio: ['ignore', log, log] }).status, 0, 'repeat setup failed; see private temp log')
    assert.equal(existsSync(sentinel), true, 'unchanged dependencies must not be reinstalled')
    assert.deepEqual(await snapshot(), before)
    for (const command of ['local:api', 'local:ui']) {
      children.push(spawn('npm', ['run', command], { detached: true, stdio: ['ignore', log, log] }))
    }
    async function ready(url) {
      const deadline = Date.now() + 30000
      while (true) {
        try { const response = await fetch(url); if (response.ok) return response } catch { /* Wait for the actual listener. */ }
        if (Date.now() >= deadline) assert.fail('startup timeout; see private temp log')
        await delay(200)
      }
    }
    await ready(`http://127.0.0.1:${apiPort}/api/v1/readiness`)
    const ui = await ready(`http://127.0.0.1:${uiPort}/`)
    assert.match(await ui.text(), /<div id="root">/)
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/login`, {
      method: 'POST', headers: { origin: `http://127.0.0.1:${uiPort}`, 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'local-demo', password: secret.DEV_DEMO_PASSWORD }),
    })
    assert.equal(response.status, 200)
    assert.ok(response.headers.get('set-cookie'))
  } finally {
    for (const child of children) { try { process.kill(-child.pid, 'SIGTERM') } catch { /* Already exited. */ } }
    closeSync(log)
    rmSync(sentinel, { force: true })
    await client.end()
  }
})

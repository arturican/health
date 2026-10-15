// @vitest-environment node
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { promisify } from 'node:util'
import { beforeAll, expect, it } from 'vitest'

beforeAll(async () => {
  await promisify(execFile)(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'])
}, 30000)

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
    env: { ...process.env, API_HOST: '127.0.0.1', API_PORT: String(reserved.port) }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  try {
    await once(child.stdout, 'data')
    const response = await fetch(`http://127.0.0.1:${String(reserved.port)}/api/v1/health`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'ok' })
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
      env: { ...process.env, API_PORT: String(reserved.port), API_HOST: '127.0.0.1' },
    })).rejects.toMatchObject({ code: 1, stdout: '', stderr: 'Не удалось запустить API: проверьте серверные настройки и доступность порта\n' })
  } finally { await reserved.close() }
})

it('неверные настройки не открывают listener и не попадают в stderr', async () => {
  await expect(promisify(execFile)(process.execPath, ['build-api/main.js'], {
    env: { ...process.env, API_PORT: 'synthetic-secret' },
  })).rejects.toMatchObject({ code: 1, stdout: '', stderr: 'Не удалось запустить API: проверьте серверные настройки и доступность порта\n' })
})

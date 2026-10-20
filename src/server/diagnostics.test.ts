// @vitest-environment node
import { spawn } from 'node:child_process'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createDiagnostics } from './diagnostics'

const eventSchema = z.strictObject({ version: z.literal(1), time: z.string(), id: z.uuid(), event: z.enum(['api_internal_error', 'email_delivery_failed', 'email_binding_failed']), suppressed: z.number().int().nonnegative() })
it('пишет только allowlist/time/random id/count в ограниченную JSON строку', () => {
  const lines: string[] = []
  const report = createDiagnostics(line => { lines.push(line) }, () => Date.UTC(2026, 9, 20, 12))
  for (const event of ['api_internal_error', 'email_delivery_failed', 'email_binding_failed'] as const) report(event)
  expect(lines).toHaveLength(3)
  const ids = new Set<string>()
  for (const line of lines) {
    const value: unknown = JSON.parse(line)
    const record = eventSchema.parse(value)
    expect(record.time).toBe('2026-10-20T12:00:00.000Z')
    expect(record.suppressed).toBe(0)
    expect(Buffer.byteLength(line)).toBeLessThanOrEqual(256)
    expect(line.endsWith('\n')).toBe(true)
    ids.add(record.id)
  }
  expect(ids.size).toBe(3)
})
it('ограничивает каждый тип30/60s, суммирует подавленные и обновляет окно на точной границе', () => {
  let time = 0
  const lines: string[] = []
  const report = createDiagnostics(line => { lines.push(line) }, () => time)
  for (let i = 0; i < 35; i++) report('api_internal_error')
  expect(lines).toHaveLength(30)
  report('email_delivery_failed')
  expect(lines).toHaveLength(31)
  time = 59999
  report('api_internal_error')
  expect(lines).toHaveLength(31)
  time = 60000
  report('api_internal_error')
  expect(lines).toHaveLength(32)
  const value: unknown = JSON.parse(lines[31] ?? '')
  expect(eventSchema.parse(value).suppressed).toBe(6)
  time = 1
  report('api_internal_error')
  expect(lines).toHaveLength(33)
})
it('ошибка writer не рекурсирует и не выходит в HTTP/mail caller', () => {
  const write = vi.fn<(line: string) => void>(() => { throw new Error('synthetic-private-writer-failure') })
  const report = createDiagnostics(write, () => 0)
  expect(() => { for (let i = 0; i < 35; i++) report('api_internal_error') }).not.toThrow()
  expect(write).toHaveBeenCalledTimes(30)
})

it('закрытый stderr не завершает процесс после диагностического события', async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    const {createDiagnostics} = await import('./src/server/diagnostics.ts')
    process.on('message', message => {
      if (message === 'go') {
        createDiagnostics()('api_internal_error')
        setImmediate(() => { process.send('alive'); process.disconnect() })
      }
    })
    process.send('ready')
  `], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: {} })
  const messages: unknown[] = []
  child.on('message', message => { messages.push(message) })
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('exit', (code, signal) => { resolve({ code, signal }) })
    child.once('error', reject)
  })
  try {
    const ready = new Promise<void>(resolve => { child.once('message', () => { resolve() }) })
    await Promise.race([ready, exited.then(() => { throw new Error('Child exited before IPC ready') })])
    expect(messages).toEqual(['ready'])
    const stream = child.stderr
    if (!stream) throw new Error('Нет отдельного stderr child')
    const closed = new Promise<void>(resolve => { stream.once('close', () => { resolve() }) })
    stream.destroy()
    await closed
    child.send('go')
    expect(await exited).toEqual({ code: 0, signal: null })
    expect(messages).toEqual(['ready', 'alive'])
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill() }
})

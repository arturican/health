import { randomUUID } from 'node:crypto'
import { writeSync } from 'node:fs'

const events = ['api_internal_error', 'email_delivery_failed', 'email_binding_failed'] as const
export type DiagnosticEvent = typeof events[number]
export type Diagnostics = (event: DiagnosticEvent) => void
declare module 'fastify' {
  interface FastifyInstance { healthDiagnostics: Diagnostics }
}

export function createDiagnostics(
  write: (line: string) => void = line => { writeSync(2, line) },
  clock = Date.now,
): Diagnostics {
  const windows = new Map<DiagnosticEvent, { start: number; sent: number; suppressed: number }>()
  return event => {
    if (!events.includes(event)) return
    const time = clock()
    let window = windows.get(event)
    let suppressed = 0
    if (!window || time < window.start || time - window.start >= 60000) {
      suppressed = window?.suppressed ?? 0
      window = { start: time, sent: 0, suppressed: 0 }
      windows.set(event, window)
    }
    if (window.sent >= 30) {
      window.suppressed = Math.min(Number.MAX_SAFE_INTEGER, window.suppressed + 1)
      return
    }
    window.sent++
    try {
      write(JSON.stringify({ version: 1, time: new Date(time).toISOString(), id: randomUUID(), event, suppressed }) + '\n')
    } catch { /* Diagnostics must not change HTTP/mail outcomes or recurse. */ }
  }
}

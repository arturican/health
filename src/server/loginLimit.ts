import { createHash } from 'node:crypto'

export function createLoginLimit() {
  const entries = new Map<string, { count: number; until: number }>()
  function consume(key: string, now: number, duration: number, limit: number) {
    for (const [name, entry] of entries) if (entry.until <= now) entries.delete(name)
    let entry = entries.get(key)
    if (!entry) {
      if (entries.size >= 10000) return false
      entry = { count: 0, until: now + duration }
      entries.set(key, entry)
    }
    if (entry.count >= limit) return false
    entry.count++
    return true
  }
  return (ip: string, login: string, now: number) => {
    const key = createHash('sha256').update(login).digest('hex')
    return consume(`ip:${ip}`, now, 60000, 30) && consume(`login:${key}`, now, 900000, 5)
  }
}

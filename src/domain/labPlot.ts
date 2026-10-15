import { readLabResult, type LabResult } from './labResult'

export interface LabSeries {
  key: string
  name: string
  unit: string
  entries: LabResult[]
}

export function groupLabResults(input: readonly unknown[]): LabSeries[] {
  const groups = new Map<string, LabSeries>()
  for (const value of input) {
    const entry = readLabResult(value)
    const key = JSON.stringify([entry.name, entry.unit])
    const existing = groups.get(key)
    if (existing) existing.entries.push(entry)
    else groups.set(key, { key, name: entry.name, unit: entry.unit, entries: [entry] })
  }
  return [...groups.values()].map(group => ({ ...group, entries: group.entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.unit.localeCompare(b.unit, 'ru'))
}

export interface LabPoint { id: string; date: string; value: number; x: number; y: number }
export interface LabPlot {
  entries: LabResult[]
  total: number
  points: LabPoint[]
  segments: string[]
  minimum: number | null
  maximum: number | null
}

export function labPlot(series: LabSeries): LabPlot {
  const entries = series.entries.slice(-100)
  const plot: LabPlot = { entries, total: series.entries.length, points: [], segments: [], minimum: null, maximum: null }
  const first = entries[0]
  const last = entries.at(-1)
  if (!series.unit || !first || !last) return plot
  const numbers = entries.flatMap(entry => entry.value.type === 'number' && entry.value.operator === 'eq'
    ? [{ entry, value: entry.value.number }] : [])
  if (numbers.length === 0) return plot
  const minimum = numbers.reduce((value, point) => Math.min(value, point.value), Infinity)
  const maximum = numbers.reduce((value, point) => Math.max(value, point.value), -Infinity)
  // Нормализация до вычитания предотвращает переполнение MAX_VALUE - (-MAX_VALUE).
  const scale = Math.max(Math.abs(minimum), Math.abs(maximum)) || 1
  const low = minimum / scale
  const span = maximum / scale - low
  const start = Date.parse(`${first.date}T00:00:00Z`)
  const duration = Date.parse(`${last.date}T00:00:00Z`) - start
  const points = numbers.map(({ entry, value }) => ({
    id: entry.id, date: entry.date, value,
    x: duration === 0 ? 300 : 40 + (Date.parse(`${entry.date}T00:00:00Z`) - start) / duration * 520,
    y: span === 0 ? 120 : 200 - (value / scale - low) / span * 160,
  }))
  const byId = new Map(points.map(point => [point.id, point]))
  const dateCounts = new Map<string, number>()
  for (const entry of entries) dateCounts.set(entry.date, (dateCounts.get(entry.date) ?? 0) + 1)
  const segments: string[] = []
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1]
    const current = entries[index]
    const from = previous ? byId.get(previous.id) : undefined
    const to = current ? byId.get(current.id) : undefined
    if (from && to && from.date !== to.date && dateCounts.get(from.date) === 1 && dateCounts.get(to.date) === 1) {
      segments.push(`${String(from.x)},${String(from.y)} ${String(to.x)},${String(to.y)}`)
    }
  }
  return { ...plot, points, segments, minimum, maximum }
}

import { z } from 'zod'
import { weightSchema } from './profile'
import { validate } from './schema'

export interface WeightPoint { id: string; date: string; kg: number; x: number; y: number }
export interface WeightPlot { points: WeightPoint[]; minimum: number | null; maximum: number | null }

export function weightPlot(input: unknown): WeightPlot {
  const weights = validate(z.array(weightSchema).max(100000), input).sort((a, b) => a.date.localeCompare(b.date))
  if (new Set(weights.map(weight => weight.date)).size !== weights.length) throw new Error('Повторяющиеся даты веса')
  if (new Set(weights.map(weight => weight.id)).size !== weights.length) throw new Error('Повторяющиеся идентификаторы веса')
  if (weights.length === 0) return { points: [], minimum: null, maximum: null }
  const minimum = weights.reduce((value, weight) => Math.min(value, weight.kg), Infinity)
  const maximum = weights.reduce((value, weight) => Math.max(value, weight.kg), 0)
  const dates = weights.map(weight => Date.parse(`${weight.date}T00:00:00Z`))
  const start = dates[0] ?? 0
  const end = dates.at(-1) ?? start
  return {
    minimum, maximum,
    points: weights.map((weight, index) => ({
      ...weight,
      x: end === start ? 300 : 40 + 520 * ((dates[index] ?? start) - start) / (end - start),
      y: maximum === minimum ? 120 : 200 - 160 * (weight.kg - minimum) / (maximum - minimum),
    })),
  }
}

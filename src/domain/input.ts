export interface NumberOptions {
  min?: number
  max?: number
  integer?: boolean
  optional?: boolean
}

export function parseNumber(input: string, options?: NumberOptions & { optional?: false }): number
export function parseNumber(input: string, options: NumberOptions): number | null
export function parseNumber(input: string, options: NumberOptions = {}): number | null {
  const text = input.trim()
  if (!text && options.optional) return null
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) {
    throw new Error('Введите число без разделителей тысяч')
  }
  const value = Number(text.replace(',', '.'))
  if (!Number.isFinite(value)) throw new Error('Число должно быть конечным')
  if (options.integer && !Number.isInteger(value)) throw new Error('Введите целое число')
  if (options.min !== undefined && value < options.min) {
    throw new Error(`Значение должно быть не меньше ${String(options.min)}`)
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`Значение должно быть не больше ${String(options.max)}`)
  }
  return value
}

export function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Введите дату в формате ГГГГ-ММ-ДД')
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value.startsWith('0000')) {
    throw new Error('Такой календарной даты не существует')
  }
  return value
}

export function localDate(date = new Date()): string {
  const year = date.getFullYear()
  if (Number.isNaN(date.getTime()) || year < 1 || year > 9999) throw new Error('Некорректная дата')
  return [String(year).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function ageOn(birthDate: string, onDate: string): number {
  parseDate(birthDate)
  parseDate(onDate)
  if (birthDate > onDate) throw new Error('Дата рождения позже даты расчёта')
  const years = Number(onDate.slice(0, 4)) - Number(birthDate.slice(0, 4))
  return years - (onDate.slice(5) < birthDate.slice(5) ? 1 : 0)
}

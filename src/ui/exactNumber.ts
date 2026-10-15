/** Display source values at Number precision; calculated summaries use their own rounding. */
export function exactNumber(value: number): string {
  return value.toLocaleString('ru-RU', { useGrouping: false, maximumSignificantDigits: 21 })
}

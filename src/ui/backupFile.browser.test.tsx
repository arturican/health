import { expect, test, vi } from 'vitest'
import { serializeTextBackup, TEXT_BACKUP_MAX_BYTES } from '../domain/backup'
import { readBackupFile } from './backupFile'

const empty = {
  format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T00:00:00.000Z',
  profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [],
}
const input = { ...empty, products: [{
  id: '00000000-0000-4000-8000-000000000001', name: 'Синтетический продукт',
  source: 'Синтетическая этикетка', kcal: 0, protein: null, fat: 0, carbs: null, archived: true,
}] }

test.each([{ label: 'компактный', spaces: undefined }, { label: 'форматированный', spaces: 2 }])(
  'настоящий UTF-8 File проходит чтение и повторный экспорт: $label', async ({ spaces }) => {
    const initial = new File([JSON.stringify(input, null, spaces)], 'synthetic.json', { type: 'application/json' })
    const parsed = await readBackupFile(initial)
    expect(parsed).toEqual({ ...input, steps: [], workouts: [], energyPlans: [] })
    const exported = new File([serializeTextBackup(parsed)], 'synthetic-export.json', { type: 'application/json' })
    expect(await readBackupFile(exported)).toEqual(parsed)
    expect(exported.size).toBe(new TextEncoder().encode(await exported.text()).byteLength)
    expect(exported.size).toBeGreaterThan((await exported.text()).length)
  },
)

test('настоящий File ровно 20 MiB читается, лишний байт отклоняется до чтения', async () => {
  const json = JSON.stringify(empty)
  const size = new TextEncoder().encode(json).byteLength
  const exact = new File([json, ' '.repeat(TEXT_BACKUP_MAX_BYTES - size)], 'synthetic-boundary.json')
  expect(exact.size).toBe(TEXT_BACKUP_MAX_BYTES)
  expect(await readBackupFile(exact)).toEqual({ ...empty, steps: [], workouts: [], energyPlans: [] })
  const oversized = new File([exact, ' '], 'synthetic-oversized.json')
  const read = vi.spyOn(oversized, 'arrayBuffer')
  try {
    await expect(readBackupFile(oversized)).rejects.toThrow('Текстовая копия превышает 20 MiB')
    expect(read).not.toHaveBeenCalled()
  } finally {
    read.mockRestore()
  }
})

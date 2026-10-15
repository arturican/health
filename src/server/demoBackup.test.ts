// @vitest-environment node
import { expect, it } from 'vitest'
import { demoBackup } from './demoBackup'
import { demoText, demoDate } from './demoText'
import { prepareFullImport } from './prepareFullImport'
import { foodTotals } from '../domain/nutrition'

it('строит согласованную историю с пропусками, архивом, неизвестными значениями и версиями плана', () => {
  const backup = demoText('2026-10-16')
  expect(demoText('2026-10-16')).toEqual(backup)
  expect(backup.weights[0]?.date).toBe('2026-07-19')
  expect(backup.weights.at(-1)?.date).toBe('2026-10-16')
  expect(backup.weights.length).toBeGreaterThan(25)
  expect(new Set(backup.foodEntries.map(row => row.id)).size).toBe(backup.foodEntries.length)
  expect(backup.foodEntries.length).toBeGreaterThan(900)
  expect(backup.nutritionDays.length).toBeLessThan(90)
  expect(backup.nutritionDays.at(-1)?.complete).toBe(false)
  expect(backup.steps.some(row => row.count === 0)).toBe(true)
  expect(backup.steps.length).toBeLessThan(90)
  expect(backup.workouts.some(row => row.kcal === null)).toBe(true)
  const archived = backup.products.find(row => row.archived)
  expect(archived).toBeDefined()
  expect(backup.foodEntries.some(row => row.productId === archived?.id)).toBe(true)
  const incompleteMacros = backup.foodEntries.find(row => row.snapshot.protein === null)
  expect(incompleteMacros).toBeDefined()
  if (!incompleteMacros) throw new Error('Нет учебного неизвестного значения')
  expect(foodTotals([incompleteMacros], true).protein).toBeNull()
  expect(backup.energyPlans.map(row => row.method)).toEqual(['none', 'factor', 'manual'])
  for (const plan of backup.energyPlans) {
    expect(backup.weights.find(row => row.date === plan.snapshot.weightDate)?.kg).toBe(plan.snapshot.kg)
  }
})

it('учитывает високосный год и отклоняет несуществующие или неподходящие даты', () => {
  expect(demoDate('2024-03-01', 1)).toBe('2024-02-29')
  expect(demoText('2024-03-01').weights.at(-1)?.date).toBe('2024-03-01')
  for (const input of ['', '2026-02-30', '0001-01-01', '2000-01-01']) expect(() => demoText(input)).toThrow()
})

it('производит воспроизводимые JPEG/PDF со связанными показателями, пригодные для серверного импорта', async () => {
  const backup = await demoBackup('2026-10-16')
  expect(await demoBackup('2026-10-16')).toEqual(backup)
  const prepared = await prepareFullImport(backup, '2026-10-16')
  expect(prepared.files).toHaveLength(6)
  expect(backup.photos).toHaveLength(3)
  expect(backup.documents).toHaveLength(3)
  expect(backup.labResults).toHaveLength(9)
  expect(prepared.files.filter(row => row.file.purpose === 'photo').every(row => row.file.dimensions?.width === 960)).toBe(true)
  for (const document of backup.documents) {
    const file = prepared.files.find(row => row.id === document.fileId)
    if (!file) throw new Error('Нет учебного PDF')
    const pdf = file.file.bytes.toString('ascii')
    expect(pdf).toContain('SYNTHETIC DEMO - NOT A MEDICAL REPORT')
    expect(pdf).toContain(`Date: ${document.date}`)
    const value = backup.labResults.find(row => row.documentId === document.id && row.name === 'Гемоглобин')?.value
    if (value?.type !== 'number') throw new Error('Нет числового показателя')
    expect(pdf).toContain(`Hemoglobin: ${String(value.number)} g/L`)
    const xref = /startxref\n(\d+)\n%%EOF/.exec(pdf)?.[1]
    expect(pdf.slice(Number(xref), Number(xref) + 4)).toBe('xref')
    const rows = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)]
    expect(rows).toHaveLength(5)
    rows.forEach((row, index) => { expect(pdf.slice(Number(row[1]))).toMatch(new RegExp(`^${String(index + 1)} 0 obj\\n`)) })
  }
})

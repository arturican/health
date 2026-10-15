import type { TextBackup } from '../src/domain/backup'

export function textBackupFixture(): TextBackup {
  const id = '10000000-0000-4000-8000-000000000001'
  return {
    format: 'health-diary-text', version: 1, exportedAt: '2026-10-15T12:00:00.000Z',
    profile: { id: 'self', name: 'Учебный профиль 🧪', heightCm: 175, birthDate: '1990-01-01', formulaSex: 'male' },
    weights: [{ id, date: '2026-10-15', kg: 70.123456789 }, { id: '10000000-0000-4000-8000-000000000002', date: '2026-10-14', kg: Number.MIN_VALUE }],
    products: [{ id, name: 'Учебный архивный продукт', source: 'Вымышленная этикетка', kcal: 345, protein: null, fat: 0, carbs: 25, archived: true }],
    foodEntries: [{ id, date: '2026-10-15', meal: 'lunch', productId: id, grams: 125, note: 'Учебная запись',
      snapshot: { name: 'Прежнее учебное название', source: '', kcal: 123, protein: null, fat: 0, carbs: 10 } }],
    nutritionDays: [{ date: '2026-10-15', complete: false }], steps: [{ date: '2026-10-15', count: 0 }],
    workouts: [{ id, date: '2026-10-15', kind: 'Учебная прогулка', minutes: 30, kcal: null, source: '', note: '' }],
    energyPlans: [{ id, revision: 1, createdOn: '2026-10-15', effectiveFrom: '2026-10-16', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null,
      source: 'Учебный план', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70.123456789, weightDate: '2026-10-15', heightCm: 175, age: 36, formulaSex: 'male' } }],
  }
}

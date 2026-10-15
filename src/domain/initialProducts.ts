import type { Product } from './nutrition'

export function initialProducts(): Product[] {
  return [
    { id: '00000000-0000-4000-8000-000000000101', name: 'Пример: продукт А', source: 'Учебные значения — замените данными этикетки', kcal: 250, protein: 12, fat: 10, carbs: 28, archived: false },
    { id: '00000000-0000-4000-8000-000000000102', name: 'Пример: продукт Б', source: 'Учебные значения — замените данными этикетки', kcal: 120, protein: null, fat: null, carbs: null, archived: false },
  ]
}

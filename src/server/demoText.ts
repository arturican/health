import { readTextBackup, type TextBackup } from '../domain/backup'
import { ageOn } from '../domain/input'
import { calendarDate } from '../domain/schema'
import { type FoodEntry } from '../domain/nutrition'
import { demoId, demoProducts } from './demoProducts.js'

export function demoDate(today: string, daysAgo: number) {
  calendarDate.parse(today)
  return calendarDate.parse(new Date(Date.parse(`${today}T12:00:00Z`) - daysAgo * 86400000).toISOString().slice(0, 10))
}

export function demoText(today: string): TextBackup {
  const dates = Array.from({ length: 90 }, (_, index) => demoDate(today, 89 - index))
  const birthDate = '1988-04-19'
  if (ageOn(birthDate, demoDate(today, 89)) < 18) throw new Error('Дата демонстрации раньше совершеннолетия вымышленного пользователя')
  const products = demoProducts()
  const weights = dates.flatMap((date, index) => index % 3 === 0 || index === 89
    ? [{ id: demoId(1000 + index), date, kg: Math.round((86.4 - index * 0.035 + Math.sin(index / 3) * 0.35) * 10) / 10 }] : [])
  const menu: [FoodEntry['meal'], number, number][] = [
    ['breakfast', 0, 250], ['breakfast', 1, 120], ['breakfast', 11, 60],
    ['lunch', 3, 160], ['lunch', 4, 200], ['lunch', 5, 200], ['lunch', 12, 12],
    ['snack', 2, 180], ['snack', 6, 170], ['snack', 7, 25],
    ['dinner', 8, 160], ['dinner', 9, 180], ['dinner', 10, 200],
  ]
  const foodEntries: FoodEntry[] = [], nutritionDays: TextBackup['nutritionDays'] = []
  dates.forEach((date, index) => {
    if (index % 19 === 5) return // Пропуск, а не нулевое потребление.
    const complete = index % 13 !== 4 && index !== 89
    nutritionDays.push({ date, complete })
    menu.forEach(([meal, productIndex, grams], portion) => {
      if (!complete && meal === 'dinner') return
      const selected = productIndex === 2 && index < 30 ? 14 : productIndex === 5 && index % 9 === 0 ? 13 : productIndex
      const product = products[selected]
      if (!product) throw new Error('Нет учебного продукта')
      const { name, source, kcal, protein, fat, carbs } = product
      foodEntries.push({ id: demoId(10000 + index * 20 + portion), date, meal, productId: product.id,
        snapshot: { name, source, kcal, protein, fat, carbs }, grams: grams + (index % 3 - 1) * 2, note: '' })
    })
  })
  return readTextBackup({ format: 'health-diary-text', version: 1, exportedAt: `${today}T12:00:00.000Z`,
    profile: { id: 'self', name: 'Илья Ветров — демо', heightCm: 178, birthDate, formulaSex: 'male' },
    weights, products, foodEntries, nutritionDays,
    steps: dates.flatMap((date, index) => index % 17 === 6 ? [] : [{ date, count: index === 17 ? 0 : 4800 + (index * 937) % 6500 }]),
    workouts: dates.flatMap((date, index) => index % 3 === 1 ? [{ id: demoId(2000 + index), date,
      kind: index % 2 === 0 ? 'Плавание' : 'Силовая тренировка', minutes: index % 2 === 0 ? 40 : 50,
      kcal: index % 4 === 0 ? null : 260 + (index % 5) * 20, source: 'Вымышленная запись часов', note: 'Демонстрационная тренировка' }] : []),
    energyPlans: [0, 30, 60].map((offset, index) => {
      const date = demoDate(today, 89 - offset), weight = weights.find(row => row.date === date)
      if (!weight) throw new Error('Нет веса для учебного плана')
      return { id: demoId(3000 + index), revision: index + 1, effectiveFrom: date, createdOn: date,
        goalKcal: index === 0 ? null : index === 1 ? 2300 : 2250,
        method: index === 0 ? 'none' : index === 1 ? 'factor' : 'manual', manualKcal: index === 2 ? 2450 : null,
        factor: index === 1 ? 1.4 : null, source: 'Учебные параметры, не рекомендация', restingFormula: 'mifflin-st-jeor-1990',
        snapshot: { kg: weight.kg, weightDate: date, heightCm: 178, age: ageOn(birthDate, date), formulaSex: 'male' } }
    }),
  }, today)
}

import { db, type DiaryDatabase } from './db'
import { getProduct } from './productRepository'
import { foodEntrySchema, mealSchema, readFoodEntry, type FoodEntry } from '../domain/nutrition'
import { entityId, validate } from '../domain/schema'
import { localDate, parseDate } from '../domain/input'

const foodInputSchema = foodEntrySchema.pick({ date: true, meal: true, productId: true, grams: true, note: true }).extend({ productId: entityId })

export async function listFood(dateInput = localDate(), database: DiaryDatabase = db): Promise<FoodEntry[]> {
  const date = parseDate(dateInput)
  const values: unknown[] = await database.foodEntries.where('date').equals(date).toArray()
  return values.map(readFoodEntry).sort((a, b) => mealSchema.options.indexOf(a.meal) - mealSchema.options.indexOf(b.meal) || a.snapshot.name.localeCompare(b.snapshot.name, 'ru'))
}

export async function addFood(input: unknown, database: DiaryDatabase = db): Promise<FoodEntry> {
  const values = validate(foodInputSchema, input)
  if (values.date > localDate()) throw new Error('Дата записи еды не может быть в будущем')
  return database.transaction('rw', database.products, database.foodEntries, async () => {
    const product = await getProduct(values.productId, database)
    if (!product) throw new Error('Продукт не найден')
    if (product.archived) throw new Error('Продукт в архиве. Выберите активный продукт')
    const snapshot = {
      name: product.name, source: product.source, kcal: product.kcal,
      protein: product.protein, fat: product.fat, carbs: product.carbs,
    }
    const entry = readFoodEntry({ ...values, snapshot, id: crypto.randomUUID() })
    await database.foodEntries.add(entry)
    return entry
  })
}

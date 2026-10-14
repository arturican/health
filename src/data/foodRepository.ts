import { db, type DiaryDatabase } from './db'
import { getProduct } from './productRepository'
import { foodEntrySchema, mealSchema, readFoodEntry, type FoodEntry } from '../domain/nutrition'
import { calendarDate, entityId, validate } from '../domain/schema'
import { localDate, parseDate } from '../domain/input'

const foodInputSchema = foodEntrySchema.pick({ date: true, meal: true, productId: true, grams: true, note: true }).extend({ productId: entityId })
const foodEditSchema = foodEntrySchema.pick({ date: true, meal: true, grams: true, note: true })

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

export async function updateFood(idInput: unknown, input: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  const changes = validate(foodEditSchema, input)
  if (changes.date > localDate()) throw new Error('Дата записи еды не может быть в будущем')
  await database.transaction('rw', database.foodEntries, async () => {
    const original: unknown = await database.foodEntries.get(id)
    if (original === undefined) throw new Error('Запись еды не найдена')
    await database.foodEntries.put({ ...readFoodEntry(original), ...changes })
  })
}

export async function deleteFood(idInput: unknown, database: DiaryDatabase = db): Promise<void> {
  await database.foodEntries.delete(validate(entityId, idInput))
}

export async function copyMeal(sourceInput: unknown, mealInput: unknown, targetInput: unknown, database: DiaryDatabase = db): Promise<number> {
  const source = validate(calendarDate, sourceInput)
  const meal = validate(mealSchema, mealInput)
  const target = validate(calendarDate, targetInput)
  if (source > localDate() || target > localDate()) throw new Error('Дата записи еды не может быть в будущем')
  if (source === target) throw new Error('Выберите другую дату для копии')
  return database.transaction('rw', database.foodEntries, async () => {
    const input: unknown[] = await database.foodEntries.where('[date+meal]').equals([source, meal]).toArray()
    const entries = input.map(readFoodEntry)
    if (entries.length === 0) throw new Error('В выбранном приёме пищи нет записей')
    const copies = entries.map(entry => ({ ...entry, id: crypto.randomUUID(), date: target }))
    await database.foodEntries.bulkAdd(copies)
    return copies.length
  })
}

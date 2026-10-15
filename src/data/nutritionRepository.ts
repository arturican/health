import { db, type DiaryDatabase } from './db'
import { nutritionDaySchema, type NutritionDay } from '../domain/nutrition'
import { validate } from '../domain/schema'
import { localDate, parseDate } from '../domain/input'
import { assertRecordCapacity } from './recordLimit'

export async function getNutritionDay(dateInput = localDate(), database: DiaryDatabase = db): Promise<NutritionDay | null> {
  const date = parseDate(dateInput)
  const input: unknown = await database.nutritionDays.get(date)
  return input === undefined ? null : validate(nutritionDaySchema, input)
}

export async function setNutritionDay(date: unknown, complete: unknown, database: DiaryDatabase = db): Promise<void> {
  const input = validate(nutritionDaySchema, { date, complete })
  if (input.date > localDate()) throw new Error('День дневника не может быть в будущем')
  await database.transaction('rw', database.nutritionDays, async () => {
    if (await database.nutritionDays.get(input.date) === undefined) assertRecordCapacity(await database.nutritionDays.count())
    await database.nutritionDays.put(input)
  })
}

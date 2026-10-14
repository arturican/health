import { db, type DiaryDatabase } from './db'
import { readSteps, type Steps } from '../domain/activity'
import { localDate } from '../domain/input'
import { calendarDate, validate } from '../domain/schema'

export async function getSteps(date: unknown = localDate(), database: DiaryDatabase = db): Promise<Steps | null> {
  const day = validate(calendarDate, date)
  const value: unknown = await database.steps.get(day)
  return value === undefined ? null : readSteps(value)
}

export async function saveSteps(input: unknown, database: DiaryDatabase = db): Promise<void> {
  const steps = readSteps(input)
  if (steps.date > localDate()) throw new Error('Дата шагов не может быть в будущем')
  await database.steps.put(steps)
}

export async function deleteSteps(date: unknown, database: DiaryDatabase = db): Promise<void> {
  await database.steps.delete(validate(calendarDate, date))
}

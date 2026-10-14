import { db, type DiaryDatabase } from './db'
import { readWorkout, workoutInputSchema, type Workout } from '../domain/activity'
import { localDate } from '../domain/input'
import { calendarDate, validate } from '../domain/schema'

export async function listWorkouts(date: unknown = localDate(), database: DiaryDatabase = db): Promise<Workout[]> {
  const day = validate(calendarDate, date)
  const values: unknown[] = await database.workouts.where('date').equals(day).toArray()
  return values.map(readWorkout).sort((a, b) => a.kind.localeCompare(b.kind, 'ru') || a.id.localeCompare(b.id))
}

export async function addWorkout(input: unknown, database: DiaryDatabase = db): Promise<Workout> {
  const values = validate(workoutInputSchema, input)
  if (values.date > localDate()) throw new Error('Дата тренировки не может быть в будущем')
  const workout = readWorkout({ ...values, id: crypto.randomUUID() })
  await database.workouts.add(workout)
  return workout
}

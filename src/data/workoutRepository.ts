import { db, type DiaryDatabase } from './db'
import { readWorkout, workoutInputSchema, type Workout } from '../domain/activity'
import { localDate } from '../domain/input'
import { calendarDate, entityId, validate } from '../domain/schema'

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

export async function updateWorkout(id: unknown, input: unknown, database: DiaryDatabase = db): Promise<void> {
  const key = validate(entityId, id)
  const values = validate(workoutInputSchema, input)
  if (values.date > localDate()) throw new Error('Дата тренировки не может быть в будущем')
  await database.transaction('rw', database.workouts, async () => {
    const previous: unknown = await database.workouts.get(key)
    if (previous === undefined) throw new Error('Тренировка не найдена')
    readWorkout(previous)
    await database.workouts.put(readWorkout({ ...values, id: key }))
  })
}

export async function deleteWorkout(id: unknown, database: DiaryDatabase = db): Promise<void> {
  await database.workouts.delete(validate(entityId, id))
}

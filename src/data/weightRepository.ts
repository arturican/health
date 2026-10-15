import { db, type DiaryDatabase } from './db'
import { getProfile } from './profileRepository'
import { readWeight, weightSchema, type Weight } from '../domain/profile'
import { entityId, validate } from '../domain/schema'
import { localDate, parseDate } from '../domain/input'
import { assertRecordCapacity } from './recordLimit'

const measurementSchema = weightSchema.omit({ id: true })

async function checkDate(date: string, database: DiaryDatabase) {
  if (date > localDate()) throw new Error('Дата измерения не может быть в будущем')
  const profile = await getProfile(database)
  if (!profile) throw new Error('Сначала создайте профиль')
  if (profile.birthDate && date < profile.birthDate) throw new Error('Дата измерения раньше даты рождения')
}

export async function listWeights(asOf = localDate(), database: DiaryDatabase = db): Promise<Weight[]> {
  const date = parseDate(asOf)
  const values: unknown[] = await database.weights.toArray()
  return values.map(readWeight).filter(weight => weight.date <= date).sort((a, b) => b.date.localeCompare(a.date))
}

export async function latestWeight(asOf = localDate(), database: DiaryDatabase = db): Promise<Weight | null> {
  return (await listWeights(asOf, database))[0] ?? null
}

export async function saveWeight(input: unknown, database: DiaryDatabase = db): Promise<void> {
  const measurement = validate(measurementSchema, input)
  await database.transaction('rw', database.profiles, database.weights, async () => {
    await checkDate(measurement.date, database)
    const existing = await database.weights.where('date').equals(measurement.date).first()
    if (!existing) assertRecordCapacity(await database.weights.count())
    const id = existing ? readWeight(existing).id : crypto.randomUUID()
    await database.weights.put({ ...measurement, id })
  })
}

export async function updateWeight(idInput: unknown, input: unknown, database: DiaryDatabase = db): Promise<void> {
  const id = validate(entityId, idInput)
  const measurement = validate(measurementSchema, input)
  await database.transaction('rw', database.profiles, database.weights, async () => {
    if (!await database.weights.get(id)) throw new Error('Измерение не найдено')
    await checkDate(measurement.date, database)
    const conflict = await database.weights.where('date').equals(measurement.date).first()
    if (conflict && readWeight(conflict).id !== id) throw new Error('На эту дату уже есть измерение')
    await database.weights.put({ ...measurement, id })
  })
}

export async function deleteWeight(idInput: unknown, database: DiaryDatabase = db): Promise<void> {
  await database.weights.delete(validate(entityId, idInput))
}

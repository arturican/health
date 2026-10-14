import { db, type DiaryDatabase } from './db'
import { readProfile, readWeight, type Profile } from '../domain/profile'
import { localDate } from '../domain/input'

export async function getProfile(database: DiaryDatabase = db): Promise<Profile | null> {
  const value: unknown = await database.profiles.get('self')
  return value === undefined ? null : readProfile(value)
}

export async function createProfile(profileInput: unknown, weightInput: unknown, database: DiaryDatabase = db): Promise<void> {
  const profile = readProfile(profileInput)
  const weight = readWeight(weightInput)
  if (weight.date > localDate()) throw new Error('Дата измерения не может быть в будущем')
  if (profile.birthDate !== null && weight.date < profile.birthDate) {
    throw new Error('Дата измерения раньше даты рождения')
  }

  await database.transaction('rw', database.profiles, database.weights, async () => {
    if (await database.profiles.get('self')) throw new Error('Профиль уже создан')
    await database.profiles.add(profile)
    await database.weights.add(weight)
  })
}

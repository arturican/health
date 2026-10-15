import { profileSchema, weightSchema } from '../domain/profile'
import { calendarDate } from '../domain/schema'
import { timezoneSchema } from './accounts.js'

const serverProfileSchema = profileSchema.omit({ birthDate: true }).extend({ birthDate: calendarDate.nullable() })

export function diaryDate(timezone: string, now: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneSchema.parse(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return calendarDate.parse(formatter.format(now))
}

export function readServerProfile(input: unknown, today: string) {
  calendarDate.parse(today)
  const profile = serverProfileSchema.parse(input)
  if (profile.birthDate !== null && profile.birthDate > today) throw new Error('Дата рождения не может быть в будущем')
  return profile
}

export function readServerWeight(input: unknown, today: string, birthDate: string | null) {
  calendarDate.parse(today)
  const weight = weightSchema.parse(input)
  if (weight.date > today) throw new Error('Дата измерения не может быть в будущем')
  if (birthDate !== null && weight.date < calendarDate.parse(birthDate)) throw new Error('Дата измерения раньше даты рождения')
  return weight
}

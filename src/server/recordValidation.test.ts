// @vitest-environment node
import { expect, it } from 'vitest'
import { diaryDate, readServerProfile, readServerWeight } from './recordValidation'

const profile = { id: 'self', name: 'Учебный профиль', heightCm: 175, birthDate: null, formulaSex: 'none' }
const weight = { id: '10000000-0000-4000-8000-000000000001', date: '2026-10-15', kg: 75 }
it('выбирает календарный день по timezone аккаунта, а не машины', () => {
  const now = new Date('2026-10-14T22:30:00Z')
  expect(diaryDate('Europe/Moscow', now)).toBe('2026-10-15')
  expect(diaryDate('America/New_York', now)).toBe('2026-10-14')
  expect(() => diaryDate('Europe/Unknown', now)).toThrow()
})
it('профиль переиспользует поля и проверяет явный день даже в прошлом', () => {
  expect(readServerProfile(profile, '2000-01-01')).toEqual(profile)
  expect(() => readServerProfile({ ...profile, birthDate: '2000-01-02' }, '2000-01-01')).toThrow('будущем')
  expect(() => readServerProfile({ ...profile, heightCm: 0 }, '2026-10-15')).toThrow()
  expect(() => readServerProfile({ ...profile, user_id: 'injected' }, '2026-10-15')).toThrow()
  expect(() => readServerProfile(null, '2026-10-15')).toThrow()
})
it('вес сохраняет точность и проверяет даты рождения/будущего', () => {
  expect(readServerWeight({ ...weight, kg: Number.MIN_VALUE }, '2026-10-15', null).kg).toBe(Number.MIN_VALUE)
  expect(() => readServerWeight(weight, '2026-10-14', null)).toThrow('будущем')
  expect(() => readServerWeight(weight, '2026-10-15', '2026-10-16')).toThrow('раньше даты рождения')
  expect(() => readServerWeight({ ...weight, kg: 601 }, '2026-10-15', null)).toThrow()
  expect(() => readServerWeight(undefined, '2026-10-15', null)).toThrow()
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readProfile, readWeight } from './profile'

const profile = {
  id: 'self', name: 'Синтетический профиль', heightCm: 170,
  birthDate: null, formulaSex: 'none',
}
const weight = {
  id: '00000000-0000-4000-8000-000000000001', date: '2026-10-14', kg: 70,
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Профиль из внешних данных', () => {
  it('возвращает проверенные данные, обрезая только внешние пробелы имени', () => {
    const input = { ...profile, name: '  Синтетический профиль  ', birthDate: '2000-02-29' }
    expect(readProfile(input)).toEqual({ ...profile, birthDate: '2000-02-29' })
    expect(input.name).toBe('  Синтетический профиль  ')
  })

  it.each(['none', 'male', 'female'])('сохраняет допустимый параметр формулы %s', formulaSex => {
    expect(readProfile({ ...profile, formulaSex }).formulaSex).toBe(formulaSex)
  })

  it('сохраняет отсутствующую дату рождения и допустимое пустое имя', () => {
    expect(readProfile({ ...profile, name: '  ' })).toEqual({ ...profile, name: '' })
    expect(readProfile(profile).birthDate).toBeNull()
  })

  it('принимает верхнюю границу роста и имени после обрезки пробелов', () => {
    const name = 'а'.repeat(80)
    expect(readProfile({ ...profile, heightCm: 300, name: ` ${name} ` })).toEqual({
      ...profile, heightCm: 300, name,
    })
    expect(readProfile({ ...profile, heightCm: 0.1 }).heightCm).toBe(0.1)
  })

  it.each<{ field: string; value: unknown; error: RegExp }>([
    { field: 'id', value: 'another', error: /профиль/ },
    { field: 'name', value: 123, error: /имя строкой/ },
    { field: 'name', value: 'а'.repeat(81), error: /Имя слишком длинное/ },
    { field: 'heightCm', value: '170', error: /рост числом/ },
    { field: 'heightCm', value: Number.NaN, error: /рост числом/ },
    { field: 'heightCm', value: Number.POSITIVE_INFINITY, error: /рост числом/ },
    { field: 'heightCm', value: 0, error: /больше нуля/ },
    { field: 'heightCm', value: -1, error: /больше нуля/ },
    { field: 'heightCm', value: 300.1, error: /максимум 300/ },
    { field: 'birthDate', value: 2000, error: /дату строкой/ },
    { field: 'birthDate', value: '1900-02-29', error: /календарная дата/ },
    { field: 'formulaSex', value: 'unknown', error: /параметр формулы/ },
  ])('отклоняет неверное поле $field понятной ошибкой', ({ field, value, error }) => {
    expect(() => readProfile({ ...profile, [field]: value })).toThrow(error)
  })

  it('принимает сегодняшнюю дату рождения и отклоняет завтрашнюю', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 14, 12))

    expect(readProfile({ ...profile, birthDate: '2026-10-14' }).birthDate).toBe('2026-10-14')
    expect(() => readProfile({ ...profile, birthDate: '2026-10-15' })).toThrow(/не может быть в будущем/)
  })

  it('отклоняет неизвестные поля без их молчаливого удаления', () => {
    expect(() => readProfile({ ...profile, external: 'fixture' })).toThrow('Неизвестные поля записи')
  })

  it.each<{ value: unknown }>([
    { value: null }, { value: [] }, { value: undefined }, { value: 'fixture' }, { value: 123 },
  ])('отклоняет значения другого типа с русским сообщением', ({ value }) => {
    expect(() => readProfile(value)).toThrow(/[А-Яа-яЁё]/)
  })
})

describe('Измерение веса из внешних данных', () => {
  it('сохраняет UUID, календарную дату и числовое значение', () => {
    expect(readWeight(weight)).toEqual(weight)
    expect(readWeight({ ...weight, date: '2000-02-29' }).date).toBe('2000-02-29')
  })

  it('принимает положительные значения и включительную техническую границу', () => {
    expect(readWeight({ ...weight, kg: 0.1 }).kg).toBe(0.1)
    expect(readWeight({ ...weight, kg: 600 }).kg).toBe(600)
  })

  it.each<{ field: string; value: unknown; error: RegExp }>([
    { field: 'id', value: 'fixture', error: /идентификатор/ },
    { field: 'date', value: '2026-04-31', error: /календарная дата/ },
    { field: 'date', value: '0000-01-01', error: /календарная дата/ },
    { field: 'date', value: null, error: /дату строкой/ },
    { field: 'kg', value: '70', error: /вес числом/ },
    { field: 'kg', value: Number.NaN, error: /вес числом/ },
    { field: 'kg', value: Number.POSITIVE_INFINITY, error: /вес числом/ },
    { field: 'kg', value: Number.NEGATIVE_INFINITY, error: /вес числом/ },
    { field: 'kg', value: 0, error: /больше нуля/ },
    { field: 'kg', value: -1, error: /больше нуля/ },
    { field: 'kg', value: 600.1, error: /максимум 600/ },
  ])('отклоняет неверное поле $field понятной ошибкой', ({ field, value, error }) => {
    expect(() => readWeight({ ...weight, [field]: value })).toThrow(error)
  })

  it('отклоняет неизвестные поля и неполные записи', () => {
    expect(() => readWeight({ ...weight, extra: true })).toThrow('Неизвестные поля записи')
    expect(() => readWeight({ id: weight.id, date: weight.date })).toThrow(/вес числом/)
  })

  it.each<{ value: unknown }>([
    { value: null }, { value: [] }, { value: undefined }, { value: 'fixture' }, { value: 123 },
  ])('отклоняет значения другого типа с русским сообщением', ({ value }) => {
    expect(() => readWeight(value)).toThrow(/[А-Яа-яЁё]/)
  })
})

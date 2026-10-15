import { expect, it } from 'vitest'
import { DEFAULT_VISIBILITY, readVisibility, readVisibilityValue } from './visibility'

it('задаёт видимость обоих разделов по умолчанию и возвращает независимые копии', () => {
  expect(DEFAULT_VISIBILITY).toEqual({ version: 1, showPhotos: true, showDocuments: true })
  expect(Object.isFrozen(DEFAULT_VISIBILITY)).toBe(true)
  const first = readVisibility(DEFAULT_VISIBILITY)
  const second = readVisibility(DEFAULT_VISIBILITY)
  expect(first).not.toBe(DEFAULT_VISIBILITY)
  expect(first).not.toBe(second)
  first.showPhotos = false
  first.showDocuments = false
  expect(second).toEqual({ version: 1, showPhotos: true, showDocuments: true })
  expect(DEFAULT_VISIBILITY).toEqual(second)
})

it('принимает четыре независимые комбинации boolean из объекта и JSON', () => {
  for (const showPhotos of [false, true]) {
    for (const showDocuments of [false, true]) {
      const input = Object.freeze({ version: 1, showPhotos, showDocuments })
      expect(readVisibility(input)).toEqual(input)
      expect(readVisibilityValue(` \n${JSON.stringify(input)}\t `)).toEqual(input)
      expect(input).toEqual({ version: 1, showPhotos, showDocuments })
    }
  }
})

it('требует полный объект версии 1 без дополнительных полей и преобразования значений', () => {
  const invalid: unknown[] = [null, undefined, false, 1, 'settings', [], {},
    { ...DEFAULT_VISIBILITY, version: 0 }, { ...DEFAULT_VISIBILITY, version: 2 }, { ...DEFAULT_VISIBILITY, version: '1' },
    { showPhotos: true, showDocuments: true }, { version: 1, showDocuments: true }, { version: 1, showPhotos: true },
    { ...DEFAULT_VISIBILITY, extra: true },
  ]
  for (const value of ['true', 'false', 0, 1, null, [], {}]) {
    invalid.push({ ...DEFAULT_VISIBILITY, showPhotos: value }, { ...DEFAULT_VISIBILITY, showDocuments: value })
  }
  for (const input of invalid) {
    expect(() => readVisibility(input)).toThrow()
    if (input !== undefined) expect(() => readVisibilityValue(JSON.stringify(input))).toThrow()
  }
})

it('отклоняет неверный JSON и нестроковые значения без неявного приведения', () => {
  for (const input of ['', ' ', '{', '{"version":1,}', '{"version":1}\n{}', undefined, null, 0, false, [], DEFAULT_VISIBILITY]) {
    expect(() => readVisibilityValue(input)).toThrow('Некорректные настройки видимости')
  }
})

it('принимает включительную границу 20 480 символов и отклоняет превышение', () => {
  const atLimit = JSON.stringify(DEFAULT_VISIBILITY).padStart(20_480, ' ')
  expect(readVisibilityValue(atLimit)).toEqual(DEFAULT_VISIBILITY)
  expect(() => readVisibilityValue(` ${atLimit}`)).toThrow('Некорректные настройки видимости')
})

it('не раскрывает исходный JSON, значения или неизвестные ключи в ошибках', () => {
  const secret = 'synthetic-private-value'
  const inputs = [
    `{"${secret}":`,
    JSON.stringify({ ...DEFAULT_VISIBILITY, [secret]: secret }),
    JSON.stringify({ ...DEFAULT_VISIBILITY, showPhotos: secret }),
    JSON.stringify(secret),
  ]
  for (const input of inputs) {
    let failure: unknown
    try {
      readVisibilityValue(input)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) throw new Error('Некорректная настройка должна отклоняться')
    expect(failure.message).not.toContain(secret)
    expect(failure.message).not.toContain(input)
  }
})

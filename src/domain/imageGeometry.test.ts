import { expect, it } from 'vitest'
import { photoSize, readImageSize } from './imageGeometry'

it.each([
  [{ width: 17, height: 23 }, { width: 17, height: 23 }],
  [{ width: 2048, height: 1024 }, { width: 2048, height: 1024 }],
  [{ width: 8000, height: 4000 }, { width: 2048, height: 1024 }],
  [{ width: 4000, height: 8000 }, { width: 1024, height: 2048 }],
  [{ width: 8000, height: 8000 }, { width: 2048, height: 2048 }],
  [{ width: 3000, height: 2000 }, { width: 2048, height: 1365 }],
])('сохраняет пропорции без увеличения и округляет размеры: %j', (input, expected) => {
  expect(photoSize(input)).toEqual(expected)
})

it('принимает ровно 64 млн пикселей и отвергает превышение на один пиксель', () => {
  expect(readImageSize({ width: 8000, height: 8000 })).toEqual({ width: 8000, height: 8000 })
  // 5213 × 12277 = 64 000 001, обе стороны находятся внутри технического предела.
  expect(() => readImageSize({ width: 5213, height: 12277 })).toThrow('Изображение превышает 64 млн пикселей')
})

it('проверяет границу каждой стороны и не округляет слишком узкий кадр до одного пикселя', () => {
  expect(photoSize({ width: 32768, height: 16 })).toEqual({ width: 2048, height: 1 })
  expect(photoSize({ width: 16, height: 32768 })).toEqual({ width: 1, height: 2048 })
  expect(() => readImageSize({ width: 32769, height: 1 })).toThrow()
  expect(() => readImageSize({ width: 1, height: 32769 })).toThrow()
  expect(() => photoSize({ width: 32768, height: 15 })).toThrow('Фото слишком узкое')
  expect(() => photoSize({ width: 15, height: 32768 })).toThrow('Фото слишком узкое')
})

it('проверяет неизвестный ввод, целочисленные положительные размеры и строгую форму объекта', () => {
  const invalid: unknown[] = [
    null, [], { width: 1 }, { width: '1', height: 1 }, { width: 0, height: 1 },
    { width: 1, height: -1 }, { width: 1.5, height: 1 }, { width: NaN, height: 1 },
    { width: 1, height: Infinity }, { width: 1, height: 1, extra: true },
  ]
  for (const input of invalid) {
    expect(() => readImageSize(input)).toThrow()
    expect(() => photoSize(input)).toThrow()
  }
})

it('не изменяет исходные размеры при проверке или уменьшении', () => {
  const input = Object.freeze({ width: 3000, height: 2000 })
  expect(readImageSize(input)).toEqual(input)
  expect(photoSize(input)).toEqual({ width: 2048, height: 1365 })
  expect(input).toEqual({ width: 3000, height: 2000 })
})

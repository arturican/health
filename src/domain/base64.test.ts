import { Buffer } from 'node:buffer'
import { afterEach, expect, it, vi } from 'vitest'
import { decodeBase64, encodeBase64, isCanonicalBase64 } from './base64'
import { DOCUMENT_MAX_BYTES } from './attachment'

afterEach(() => { vi.restoreAllMocks() })
it.each([1, 2, 3, 32765, 32766, 32767, 65531, 65532, 65533])('кодирует все значения байта и границу чанка %i без потери данных', length => {
  const buffer = new Uint8Array(length + 4)
  for (let index = 0; index < buffer.length; index++) buffer[index] = index % 256
  const source = buffer.subarray(2, length + 2)
  const expected = Buffer.from(source).toString('base64')
  expect(encodeBase64(source)).toBe(expected)
  expect(isCanonicalBase64(expected, length)).toBe(true)
  expect(decodeBase64(expected, length)).toEqual(source)
})

it.each([
  ['Zg==', 1, 'f'], ['Zm8=', 2, 'fo'], ['Zm9v', 3, 'foo'], ['Zm9vYmFy', 6, 'foobar'],
])('принимает независимый пример RFC %s', (encoded, size, text) => {
  expect(Array.from(decodeBase64(encoded, size))).toEqual(Array.from(new TextEncoder().encode(text)))
})

it.each([
  ['TR==', 1], ['TWF=', 2], ['TQ', 1], ['TQ===', 1], ['TQ==\n', 1],
  ['T Q=', 1], ['TQ=A', 1], ['éééé', 3], ['____', 3], ['AA==', 2],
  [null, 1], ['AA==', 0], ['AA==', 1.5], ['AA==', Infinity], ['AA==', DOCUMENT_MAX_BYTES + 1],
])('отвергает неканонические/неполные данные %j размер %i до декодирования', (encoded, size) => {
  const decoder = vi.spyOn(globalThis, 'atob')
  expect(isCanonicalBase64(encoded, size)).toBe(false)
  expect(() => decodeBase64(encoded, size)).toThrow('Некорректные данные Base64 файла')
  expect(decoder).not.toHaveBeenCalled()
})

it('проверяет границу 20 MiB без большого декодирования и отвергает лишний байт до btoa', () => {
  const length = 4 * Math.ceil(DOCUMENT_MAX_BYTES / 3)
  const encoded = `${'A'.repeat(length - 1)}=`
  expect(isCanonicalBase64(encoded, DOCUMENT_MAX_BYTES)).toBe(true)
  const encoder = vi.spyOn(globalThis, 'btoa')
  expect(() => encodeBase64(new Uint8Array(DOCUMENT_MAX_BYTES + 1))).toThrow('Некорректный размер двоичного файла')
  expect(encoder).not.toHaveBeenCalled()
})

it('отвергает неизвестный/пустой ввод и скрывает отказ платформенного декодера', () => {
  for (const input of [null, [], new Uint8Array(), 'AA==']) expect(() => encodeBase64(input)).toThrow()
  vi.spyOn(globalThis, 'atob').mockImplementation(() => { throw new Error('private') })
  expect(() => decodeBase64('AA==', 1)).toThrow('Не удалось декодировать файл копии')
})

it('проверяет действительный размер при отказе платформенного декодера возвращать ожидаемые байты', () => {
  vi.spyOn(globalThis, 'atob').mockReturnValue('')
  expect(() => decodeBase64('AA==', 1)).toThrow('Размер файла не соответствует данным')
})

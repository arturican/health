import { Blob as NativeBlob } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readStoredFile } from './storedFile'
import { DOCUMENT_MAX_BYTES, PHOTO_MAX_BYTES } from './attachment'

const id = '00000000-0000-4000-8000-000000000001'
beforeEach(() => { vi.stubGlobal('Blob', NativeBlob) })
afterEach(() => { vi.unstubAllGlobals() })

function record(size = 3, mime = 'image/png', purpose = 'photo') {
  const blob = new NativeBlob([new Uint8Array(size)], { type: mime })
  return { id, size, mime, purpose, blob }
}

it('проверяет метаданные Blob и сохраняет исходный объект файла', () => {
  const file = record()
  expect(readStoredFile(file)).toEqual(file)
  expect(readStoredFile(file).blob).toBe(file.blob)
  expect(readStoredFile(record(3, 'application/pdf', 'document')).mime).toBe('application/pdf')
})

it('отклоняет несогласованный размер, MIME и неподходящее назначение', () => {
  const file = record()
  expect(() => readStoredFile({ ...file, size: 2 })).toThrow('Метаданные вложения не совпадают с файлом')
  expect(() => readStoredFile({ ...file, mime: 'image/jpeg' })).toThrow('Метаданные вложения не совпадают с файлом')
  expect(() => readStoredFile(record(3, 'application/pdf'))).toThrow('Некорректный файл фотографии')
  expect(() => readStoredFile(record(PHOTO_MAX_BYTES + 1))).toThrow('Некорректный файл фотографии')
  expect(readStoredFile(record(PHOTO_MAX_BYTES)).size).toBe(PHOTO_MAX_BYTES)
  expect(readStoredFile(record(DOCUMENT_MAX_BYTES, 'application/pdf', 'document')).size).toBe(DOCUMENT_MAX_BYTES)
  expect(() => readStoredFile(record(DOCUMENT_MAX_BYTES + 1, 'application/pdf', 'document'))).toThrow()
})

it('валидирует неизвестную запись целиком, не принимая JSON-имитацию Blob или лишние поля', () => {
  const file = record()
  for (const input of [
    null, [], {}, { ...file, id: 'bad-id' }, { ...file, purpose: 'other' }, { ...file, mime: 'text/html' },
    { ...file, size: 0 }, { ...file, size: 1.5 }, { ...file, size: NaN }, { ...file, size: '3' },
    { ...file, blob: { size: 3, type: 'image/png' } }, { ...file, extra: true },
  ]) expect(() => readStoredFile(input)).toThrow()
})

import { Blob as NativeBlob } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { checkBackupFile } from './checkBackupFile'
import { type StoredFile } from '../domain/storedFile'
import { type Photo } from '../domain/photo'

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 2, 0, 1, 1, 1, 17, 0, 255, 217])
const id = '00000000-0000-4000-8000-000000000001'
const photo: Photo = { id: '00000000-0000-4000-8000-000000000002', fileId: id, date: '2000-01-01', title: 'Синтетический кадр', note: '', width: 1, height: 2 }
const decode = vi.fn()
function image(): StoredFile {
  const blob = new Blob([jpeg], { type: 'image/jpeg' })
  return { id, blob, mime: 'image/jpeg', size: blob.size, purpose: 'photo' }
}
beforeEach(() => { vi.stubGlobal('Blob', NativeBlob); vi.stubGlobal('createImageBitmap', decode); decode.mockReset() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('проверяет PDF и возвращает исходные байты без декодера изображения', async () => {
  const blob = new NativeBlob(['%PDF-1.7\nSynthetic\n%%EOF\n'], { type: 'application/pdf' })
  const bytes = await checkBackupFile({ id, blob, mime: 'application/pdf', size: blob.size, purpose: 'document' })
  expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(await blob.arrayBuffer())))
  expect(decode).not.toHaveBeenCalled()
})

it('сверяет реальные размеры фотографии и освобождает bitmap без изменения JPEG', async () => {
  const close = vi.fn()
  decode.mockResolvedValue({ width: 1, height: 2, close })
  expect(await checkBackupFile(image(), photo)).toEqual(jpeg)
  expect(close).toHaveBeenCalledTimes(1)
  expect(decode).toHaveBeenCalledWith(expect.any(NativeBlob), { imageOrientation: 'from-image' })
})

it('отвергает отсутствующую карточку/связь и несоответствующий заголовок до декодирования', async () => {
  await expect(checkBackupFile(image())).rejects.toThrow()
  await expect(checkBackupFile(image(), { ...photo, fileId: photo.id })).rejects.toThrow('Нарушена связь фотографии с файлом')
  await expect(checkBackupFile(image(), { ...photo, width: 2 })).rejects.toThrow('Размеры фото не совпадают с карточкой')
  expect(decode).not.toHaveBeenCalled()
})

it('закрывает bitmap при несовпадении или невозможных действительных размерах', async () => {
  for (const size of [{ width: 1, height: 3 }, { width: 0, height: 2 }]) {
    const close = vi.fn()
    decode.mockResolvedValueOnce({ ...size, close })
    await expect(checkBackupFile(image(), photo)).rejects.toThrow()
    expect(close).toHaveBeenCalledTimes(1)
  }
})

it('скрывает отказ чтения/декодера и отвергает неизвестный формат', async () => {
  const source = image()
  vi.spyOn(source.blob, 'arrayBuffer').mockRejectedValueOnce(new Error('private'))
  await expect(checkBackupFile(source, photo)).rejects.toThrow('Не удалось прочитать файл копии')
  decode.mockRejectedValueOnce(new Error('private'))
  await expect(checkBackupFile(image(), photo)).rejects.toThrow('Не удалось декодировать изображение копии')
  const blob = new NativeBlob(['<html>synthetic</html>'], { type: 'application/pdf' })
  await expect(checkBackupFile({ id, blob, mime: 'application/pdf', size: blob.size, purpose: 'document' })).rejects.toThrow('Неподдерживаемый формат')
})

it('подготовленное фото с EXIF APP1 отклоняется до декодера изображения', async () => {
  const bytes = new Uint8Array([...jpeg.slice(0, 2), 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, ...jpeg.slice(2)])
  const blob = new Blob([bytes], { type: 'image/jpeg' })
  await expect(checkBackupFile({ id, blob, mime: 'image/jpeg', size: blob.size, purpose: 'photo' }, photo)).rejects.toThrow('Подготовленное фото в копии содержит EXIF')
  expect(decode).not.toHaveBeenCalled()
})

it('JPEG документа сохраняет исходный EXIF APP1 и освобождает bitmap', async () => {
  const bytes = new Uint8Array([...jpeg.slice(0, 2), 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, ...jpeg.slice(2)])
  const blob = new Blob([bytes], { type: 'image/jpeg' })
  const close = vi.fn()
  decode.mockResolvedValue({ width: 1, height: 2, close })
  expect(Array.from(await checkBackupFile({ id, blob, mime: 'image/jpeg', size: blob.size, purpose: 'document' }))).toEqual(Array.from(bytes))
  expect(close).toHaveBeenCalledTimes(1)
})

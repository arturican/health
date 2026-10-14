import { Blob as NativeBlob, Buffer } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { preparePhoto } from './preparePhoto'

const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKz8AAAAASUVORK5CYII=', 'base64'))
const decode = vi.fn()
beforeEach(() => { vi.stubGlobal('Blob', NativeBlob); vi.stubGlobal('createImageBitmap', decode); decode.mockReset() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function file() { return new NativeBlob([bytes], { type: 'image/png' }) }

it('не запускает декодер при неверном формате или слишком большой площади заголовка', async () => {
  await expect(preparePhoto(new NativeBlob(['<svg/>'], { type: 'image/png' }))).rejects.toThrow('Неподдерживаемый формат')
  const large = bytes.slice()
  const view = new DataView(large.buffer)
  view.setUint32(16, 9000)
  view.setUint32(20, 8000)
  await expect(preparePhoto(new NativeBlob([large], { type: 'image/png' }))).rejects.toThrow('64 млн пикселей')
  expect(decode).not.toHaveBeenCalled()
})

it('скрывает подробности отказа чтения исходника после проверки контейнера', async () => {
  const input = file()
  vi.spyOn(input, 'arrayBuffer').mockRejectedValueOnce(new Error('Синтетическая закрытая подробность'))
  await expect(preparePhoto(input)).rejects.toMatchObject({ message: 'Не удалось прочитать фото' })
  expect(decode).not.toHaveBeenCalled()
})

it('не раскрывает ошибку декодера и явно передаёт обработку ориентации EXIF', async () => {
  decode.mockRejectedValueOnce(new Error('Синтетическое закрытое содержимое'))
  await expect(preparePhoto(file())).rejects.toMatchObject({ message: 'Не удалось декодировать фото' })
  expect(decode).toHaveBeenCalledWith(expect.any(NativeBlob), { imageOrientation: 'from-image' })
})

it('закрывает bitmap при невозможных размерах результата декодирования', async () => {
  const close = vi.fn()
  decode.mockResolvedValueOnce({ width: 0, height: 1, close })
  await expect(preparePhoto(file())).rejects.toMatchObject({ message: 'Не удалось подготовить фото в браузере' })
  expect(close).toHaveBeenCalledTimes(1)
})

it('закрывает bitmap при недоступном canvas, не оставляя незавершённую обработку', async () => {
  const close = vi.fn()
  decode.mockResolvedValueOnce({ width: 1, height: 1, close })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  await expect(preparePhoto(file())).rejects.toMatchObject({ message: 'Не удалось подготовить фото в браузере' })
  expect(close).toHaveBeenCalledTimes(1)
})

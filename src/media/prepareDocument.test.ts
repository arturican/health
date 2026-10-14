import { Blob as NativeBlob, Buffer } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareDocument } from './prepareDocument'

const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKz8AAAAASUVORK5CYII=', 'base64'))
const decode = vi.fn()
beforeEach(() => { vi.stubGlobal('Blob', NativeBlob); vi.stubGlobal('createImageBitmap', decode); decode.mockReset() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function image() { return new NativeBlob([bytes], { type: 'image/png' }) }

it('сохраняет PDF без обращения к декодеру и без изменения исходных байтов', async () => {
  const input = new NativeBlob(['%PDF-1.7\nSynthetic\n%%EOF\n'], { type: 'application/pdf' })
  const result = await prepareDocument(input)
  expect(result).toMatchObject({ mime: 'application/pdf', purpose: 'document', size: input.size })
  expect(await result.blob.text()).toBe(await input.text())
  expect(decode).not.toHaveBeenCalled()
})

it('отвергает формат и опасные размеры заголовка до декодирования', async () => {
  await expect(prepareDocument(new NativeBlob(['<svg/>'], { type: 'image/png' }))).rejects.toThrow('Неподдерживаемый формат')
  const large = bytes.slice()
  new DataView(large.buffer).setUint32(16, 9000)
  new DataView(large.buffer).setUint32(20, 8000)
  await expect(prepareDocument(new NativeBlob([large], { type: 'image/png' }))).rejects.toThrow('64 млн пикселей')
  expect(decode).not.toHaveBeenCalled()
})

it('обрабатывает отказ чтения/декодирования без раскрытия содержимого', async () => {
  const input = image()
  vi.spyOn(input, 'arrayBuffer').mockRejectedValueOnce(new Error('private'))
  await expect(prepareDocument(input)).rejects.toThrow('Не удалось прочитать изображение документа')
  decode.mockRejectedValueOnce(new Error('private'))
  await expect(prepareDocument(image())).rejects.toThrow('Не удалось декодировать изображение документа')
  expect(decode).toHaveBeenCalledWith(expect.any(NativeBlob), { imageOrientation: 'from-image' })
})

it('закрывает bitmap при некорректных действительных размерах', async () => {
  const close = vi.fn()
  decode.mockResolvedValueOnce({ width: 0, height: 1, close })
  await expect(prepareDocument(image())).rejects.toThrow()
  expect(close).toHaveBeenCalledTimes(1)
})

it('закрывает успешный bitmap и сохраняет оригинал с прежним MIME', async () => {
  const close = vi.fn()
  decode.mockResolvedValueOnce({ width: 1, height: 1, close })
  const result = await prepareDocument(image())
  expect(result.mime).toBe('image/png')
  expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes)
  expect(close).toHaveBeenCalledTimes(1)
})

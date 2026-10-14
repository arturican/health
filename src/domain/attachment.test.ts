import { Blob as NativeBlob, File as NativeFile, Buffer } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { checkAttachment, DOCUMENT_MAX_BYTES, PHOTO_MAX_BYTES, type AttachmentMime } from './attachment'

const ascii = (value: string) => new TextEncoder().encode(value)
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKz8AAAAASUVORK5CYII=', 'base64'))
// JPEG/WebP fixtures exercise structure only; decoding pixels belongs to T045.
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 1, 2, 255, 217])
function webp(chunk = 'VP8 ') {
  const bytes = new Uint8Array(24)
  bytes.set(ascii('RIFF'))
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true)
  bytes.set(ascii(`WEBP${chunk}`), 8)
  new DataView(bytes.buffer).setUint32(16, 4, true)
  return bytes
}
const pdf = ascii('%PDF-1.7\nSynthetic document\n%%EOF\n')
const fixtures: { mime: AttachmentMime; bytes: Uint8Array }[] = [
  { mime: 'image/jpeg', bytes: jpeg }, { mime: 'image/png', bytes: png },
  { mime: 'image/webp', bytes: webp() }, { mime: 'application/pdf', bytes: pdf },
]

beforeEach(() => { vi.stubGlobal('Blob', NativeBlob) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each(fixtures)('принимает структуру $mime и сохраняет исходный Blob, MIME и байты', async ({ mime, bytes }) => {
  const input = new NativeBlob([bytes], { type: mime })
  const result = await checkAttachment(input, 'document')
  expect(result).toEqual({ blob: input, mime, size: bytes.length })
  expect(result.blob).toBe(input)
  expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()))).toEqual(Array.from(bytes))
  if (mime !== 'application/pdf') expect((await checkAttachment(input, 'photo')).mime).toBe(mime)
})

it.each(fixtures)('распознаёт $mime без MIME и возвращает канонический Blob без изменения байтов', async ({ mime, bytes }) => {
  const input = new NativeFile([bytes], 'synthetic-misleading-name.exe')
  const result = await checkAttachment(input, 'document')
  expect(result.blob).not.toBe(input)
  expect(result.blob.type).toBe(mime)
  expect(result.size).toBe(input.size)
  expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()))).toEqual(Array.from(bytes))
})

it('проверяет назначение, пустой файл и тип входа до чтения содержимого', async () => {
  const input = new NativeBlob([png], { type: 'image/png' })
  const slice = vi.spyOn(input, 'slice')
  for (const purpose of [null, 'unknown', {}, 1]) await expect(checkAttachment(input, purpose)).rejects.toThrow()
  expect(slice).not.toHaveBeenCalled()
  for (const value of [null, 'file', png, { size: 1, type: 'image/png' }]) {
    await expect(checkAttachment(value, 'photo')).rejects.toThrow('Выберите файл вложения')
  }
  await expect(checkAttachment(new NativeBlob([]), 'photo')).rejects.toThrow('Файл пуст')
  await expect(checkAttachment(new NativeBlob([pdf], { type: 'application/pdf' }), 'photo')).rejects.toThrow('Неподдерживаемый формат вложения')
})

it('отвергает подмену MIME, SVG, HTML и исполняемую сигнатуру независимо от имени', async () => {
  for (const type of ['image/jpeg', 'application/octet-stream', 'text/plain']) {
    await expect(checkAttachment(new NativeBlob([png], { type }), 'photo')).rejects.toThrow('MIME файла не соответствует содержимому')
  }
  for (const bytes of [ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'), ascii('<!doctype html><script>alert(1)</script>'), ascii('MZsynthetic'), new Uint8Array([137, 80])]) {
    await expect(checkAttachment(new NativeFile([bytes], 'synthetic.png', { type: 'image/png' }), 'document')).rejects.toThrow('Неподдерживаемый формат вложения')
  }
})

it('отвергает обрезанные и испорченные завершения JPEG, PNG, WebP и PDF', async () => {
  const wrongRiff = webp()
  new DataView(wrongRiff.buffer).setUint32(4, wrongRiff.length - 9, true)
  for (const [bytes, type] of [
    [jpeg.slice(0, -1), 'image/jpeg'], [new Uint8Array([...jpeg, 0]), 'image/jpeg'],
    [png.slice(0, -1), 'image/png'], [new Uint8Array([...png, 0]), 'image/png'],
    [wrongRiff, 'image/webp'], [pdf.slice(0, -7), 'application/pdf'],
    [ascii('%PDF-1.7\n%%EOF\ntrailing-content'), 'application/pdf'],
    [ascii(`%PDF-1.7\n%%EOF${' '.repeat(1025)}`), 'application/pdf'],
  ] as const) {
    await expect(checkAttachment(new NativeBlob([bytes], { type }), 'document')).rejects.toThrow('Файл повреждён или обрезан')
  }
})

it('проверяет допустимые PDF-версии и границу строки заголовка', async () => {
  for (const version of ['1.0', '1.7', '2.0']) {
    for (const newline of ['\n', '\r', '\r\n']) {
      expect((await checkAttachment(new NativeBlob([ascii(`%PDF-${version}${newline}Synthetic\n%%EOF\t\r\n`)]), 'document')).mime).toBe('application/pdf')
    }
  }
  for (const header of ['%PDF-1.8\n', '%PDF-2.1\n', '%PDF-1.70\n', '%PDF-2.00\n', '%PDF-1.7X']) {
    await expect(checkAttachment(new NativeBlob([ascii(`${header}Synthetic\n%%EOF`)]), 'document')).rejects.toThrow('Неподдерживаемый формат вложения')
  }
})

it('требует поддерживаемый первый image-chunk WebP', async () => {
  for (const chunk of ['VP8 ', 'VP8L', 'VP8X']) expect((await checkAttachment(new NativeBlob([webp(chunk)]), 'photo')).mime).toBe('image/webp')
  await expect(checkAttachment(new NativeBlob([webp('JUNK')]), 'photo')).rejects.toThrow('Неподдерживаемый формат вложения')
  await expect(checkAttachment(new NativeBlob([webp().slice(0, 16)]), 'photo')).rejects.toThrow('Неподдерживаемый формат вложения')
  const oddChunk = webp().slice(0, 22)
  const view = new DataView(oddChunk.buffer)
  view.setUint32(4, oddChunk.length - 8, true)
  view.setUint32(16, 1, true)
  expect((await checkAttachment(new NativeBlob([oddChunk]), 'photo')).size).toBe(22)
  for (const size of [0, 5]) {
    const invalid = webp()
    new DataView(invalid.buffer).setUint32(16, size, true)
    await expect(checkAttachment(new NativeBlob([invalid]), 'photo')).rejects.toThrow('Файл повреждён или обрезан')
  }
})

it('принимает точные 10 MiB фото и 20 MiB документа, но не читает превышение на один байт', async () => {
  const image = new NativeBlob([png.slice(0, 8), new Uint8Array(PHOTO_MAX_BYTES - 20), png.slice(-12)], { type: 'image/png' })
  const documentHeader = ascii('%PDF-2.0\n')
  const documentEnd = ascii('\n%%EOF\n')
  const document = new NativeBlob([documentHeader, new Uint8Array(DOCUMENT_MAX_BYTES - documentHeader.length - documentEnd.length), documentEnd], { type: 'application/pdf' })
  expect((await checkAttachment(image, 'photo')).size).toBe(PHOTO_MAX_BYTES)
  expect((await checkAttachment(document, 'document')).size).toBe(DOCUMENT_MAX_BYTES)
  for (const [purpose, limit, message] of [['photo', PHOTO_MAX_BYTES, '10'], ['document', DOCUMENT_MAX_BYTES, '20']] as const) {
    const oversize = new NativeBlob([new Uint8Array(limit + 1)])
    const slice = vi.spyOn(oversize, 'slice')
    await expect(checkAttachment(oversize, purpose)).rejects.toThrow(`Размер файла превышает ${message} MiB`)
    expect(slice).not.toHaveBeenCalled()
  }
})

it('заменяет ошибку чтения общим сообщением без исходного содержимого и деталей', async () => {
  const input = new NativeBlob([png])
  const header = new NativeBlob([png.slice(0, 32)])
  vi.spyOn(header, 'arrayBuffer').mockRejectedValueOnce(new Error('Синтетическое закрытое содержимое'))
  vi.spyOn(input, 'slice').mockReturnValueOnce(header)
  await expect(checkAttachment(input, 'document')).rejects.toMatchObject({ message: 'Не удалось прочитать вложение' })
})

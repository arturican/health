import { expect, it } from 'vitest'
import { imageHeaderSize } from './imageHeader'

const ascii = (value: string) => new TextEncoder().encode(value)
function png(width: number, height: number) {
  const bytes = new Uint8Array(33)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set(ascii('IHDR'), 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  bytes.set([8, 2, 0, 0, 0], 24)
  return bytes
}
function jpeg(width: number, height: number, marker = 192) {
  return new Uint8Array([
    255, 216, 255, 224, 0, 4, 0, 0, 255, 255, 208, 255, marker,
    0, 11, 8, height >>> 8, height & 255, width >>> 8, width & 255, 1, 1, 17, 0, 255, 217,
  ])
}
function webp(width: number, height: number, chunk: 'VP8 ' | 'VP8L' | 'VP8X') {
  const bytes = new Uint8Array(chunk === 'VP8L' ? 26 : 30)
  const view = new DataView(bytes.buffer)
  bytes.set(ascii('RIFF'))
  view.setUint32(4, bytes.length - 8, true)
  bytes.set(ascii(`WEBP${chunk}`), 8)
  view.setUint32(16, chunk === 'VP8L' ? 5 : 10, true)
  if (chunk === 'VP8X') {
    const w = width - 1
    const h = height - 1
    bytes.set([w & 255, (w >>> 8) & 255, (w >>> 16) & 255, h & 255, (h >>> 8) & 255, (h >>> 16) & 255], 24)
  } else if (chunk === 'VP8L') {
    bytes[20] = 47
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true)
  } else {
    bytes.set([157, 1, 42], 23)
    view.setUint16(26, width | 32768, true)
    view.setUint16(28, height | 16384, true)
  }
  return bytes
}

it('читает PNG IHDR, JPEG baseline/progressive и все три формата первого WebP chunk', () => {
  expect(imageHeaderSize(png(3000, 2000), 'image/png')).toEqual({ width: 3000, height: 2000 })
  for (const marker of [192, 194]) expect(imageHeaderSize(jpeg(640, 480, marker), 'image/jpeg')).toEqual({ width: 640, height: 480 })
  for (const chunk of ['VP8 ', 'VP8L', 'VP8X'] as const) {
    expect(imageHeaderSize(webp(1234, 567, chunk), 'image/webp')).toEqual({ width: 1234, height: 567 })
  }
})

it('уважает byteOffset и не изменяет входной заголовок', () => {
  const original = png(640, 480)
  const container = new Uint8Array(original.length + 9)
  container.set(original, 5)
  const input = container.subarray(5, 5 + original.length)
  expect(imageHeaderSize(input, 'image/png')).toEqual({ width: 640, height: 480 })
  expect(Array.from(input)).toEqual(Array.from(original))
  expect(container.slice(0, 5)).toEqual(new Uint8Array(5))
})

it('не читает размеры PNG из неподдерживаемой сигнатуры или не-IHDR первого chunk', () => {
  const wrongSignature = png(640, 480)
  wrongSignature[0] = 0
  const wrongChunk = png(640, 480)
  wrongChunk.set(ascii('JUNK'), 12)
  const wrongLength = png(640, 480)
  new DataView(wrongLength.buffer).setUint32(8, 12)
  for (const bytes of [wrongSignature, wrongChunk, wrongLength, png(640, 480).slice(0, 23)]) {
    expect(() => imageHeaderSize(bytes, 'image/png')).toThrow()
  }
})

it('требует полный PNG IHDR с допустимыми depth/color/compression/filter/interlace', () => {
  for (let length = 24; length < 33; length++) expect(() => imageHeaderSize(png(640, 480).slice(0, length), 'image/png')).toThrow()
  for (const [offset, value] of [[24, 3], [25, 1], [26, 1], [27, 1], [28, 2]] as const) {
    const bytes = png(640, 480)
    bytes[offset] = value
    expect(() => imageHeaderSize(bytes, 'image/png')).toThrow()
  }
  const interlacedRgba = png(640, 480)
  interlacedRgba.set([16, 6, 0, 0, 1], 24)
  expect(imageHeaderSize(interlacedRgba, 'image/png')).toEqual({ width: 640, height: 480 })
})

it('отвергает JPEG без SOI/SOF, с обрезанным или некорректным сегментом и ранним SOS/EOI', () => {
  const wrongSignature = jpeg(640, 480)
  wrongSignature[0] = 0
  const invalid: Uint8Array[] = [
    wrongSignature, new Uint8Array([255, 216, 255]), new Uint8Array([255, 216, 0, 0]),
    new Uint8Array([255, 216, 255, 224, 0, 1]),
    new Uint8Array([255, 216, 255, 224, 0, 20, 0, 0]),
    new Uint8Array([255, 216, 255, 192, 0, 7, 8, 0, 1, 0, 1]),
    new Uint8Array([255, 216, 255, 218, ...jpeg(640, 480)]),
    new Uint8Array([255, 216, 255, 217, ...jpeg(640, 480)]),
  ]
  for (const bytes of invalid) expect(() => imageHeaderSize(bytes, 'image/jpeg')).toThrow()
})

it('требует допустимое число JPEG SOF-компонентов и все объявленные дескрипторы', () => {
  for (const count of [0, 2, 5]) {
    const bytes = jpeg(640, 480)
    bytes[20] = count
    expect(() => imageHeaderSize(bytes, 'image/jpeg')).toThrow()
  }
  expect(() => imageHeaderSize(jpeg(640, 480).slice(0, 21), 'image/jpeg')).toThrow()
})

it('различает WebP chunks и отвергает неверный RIFF, frame sync, lossless marker и обрезанный header', () => {
  const wrongRiff = webp(640, 480, 'VP8X')
  wrongRiff[0] = 0
  const unknownChunk = webp(640, 480, 'VP8L')
  unknownChunk.set(ascii('JUNK'), 12)
  const wrongFrame = webp(640, 480, 'VP8 ')
  wrongFrame[23] = 0
  const wrongLossless = webp(640, 480, 'VP8L')
  wrongLossless[20] = 0
  for (const bytes of [wrongRiff, unknownChunk, wrongFrame, wrongLossless, webp(640, 480, 'VP8X').slice(0, 29), webp(640, 480, 'VP8L').slice(0, 24)]) {
    expect(() => imageHeaderSize(bytes, 'image/webp')).toThrow()
  }
})

it('не извлекает WebP-размеры из байтов за пределами объявленного первого payload', () => {
  for (const [chunk, size] of [['VP8 ', 9], ['VP8L', 4]] as const) {
    const bytes = webp(640, 480, chunk)
    new DataView(bytes.buffer).setUint32(16, size, true)
    expect(() => imageHeaderSize(bytes, 'image/webp')).toThrow()
  }
})

it('проверяет положительные размеры, стороны и площадь до декодирования', () => {
  expect(imageHeaderSize(png(8000, 8000), 'image/png')).toEqual({ width: 8000, height: 8000 })
  for (const dimensions of [[0, 1], [1, 0], [32769, 1], [5213, 12277]] as const) {
    expect(() => imageHeaderSize(png(dimensions[0], dimensions[1]), 'image/png')).toThrow()
  }
  expect(() => imageHeaderSize(jpeg(0, 100), 'image/jpeg')).toThrow()
  expect(() => imageHeaderSize(webp(32769, 1, 'VP8X'), 'image/webp')).toThrow()
})

it('проверяет неизвестные байты и MIME, не трактуя PDF как изображение', () => {
  for (const bytes of [null, [1, 2, 3], new ArrayBuffer(10), {}]) expect(() => imageHeaderSize(bytes, 'image/png')).toThrow()
  for (const mime of [null, 'image/svg+xml', 'unknown', 1]) expect(() => imageHeaderSize(png(1, 1), mime)).toThrow()
  expect(() => imageHeaderSize(png(1, 1), 'application/pdf')).toThrow('Не удалось прочитать размеры изображения')
})

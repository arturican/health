import { z } from 'zod'
import { attachmentMimes } from './attachment'
import { validate } from './schema'
import { readImageSize, type ImageSize } from './imageGeometry'

function jpegSize(bytes: Uint8Array): ImageSize {
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 255) break
    while (bytes[offset] === 255) offset++
    const marker = bytes[offset++]
    if (marker === undefined || marker === 217 || marker === 218) break
    if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
    if (length < 2 || offset + length > bytes.length) break
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      const components = bytes[offset + 7] ?? 0
      if (components < 1 || components > 4 || length !== 8 + 3 * components) break
      return readImageSize({ width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0), height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0) })
    }
    offset += length
  }
  throw new Error('Не удалось прочитать размеры JPEG')
}

/** Called on bytes whose container signature has already passed checkAttachment. */
export function imageHeaderSize(input: unknown, mimeInput: unknown): ImageSize {
  const mime = validate(z.enum(attachmentMimes), mimeInput)
  if (!(input instanceof Uint8Array)) throw new Error('Некорректные байты изображения')
  const bytes = input
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (offset: number, length: number) => new TextDecoder('ascii').decode(bytes.slice(offset, offset + length))
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) return jpegSize(bytes)
  if (mime === 'image/png' && bytes.length >= 33 && bytes[0] === 137 && text(1, 3) === 'PNG' && view.getUint32(8) === 13 && text(12, 4) === 'IHDR') {
    const depths: Record<number, readonly number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
    if (depths[bytes[25] ?? -1]?.includes(bytes[24] ?? 0) && bytes[26] === 0 && bytes[27] === 0 && (bytes[28] === 0 || bytes[28] === 1)) return readImageSize({ width: view.getUint32(16), height: view.getUint32(20) })
  }
  if (mime === 'image/webp' && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const chunk = text(12, 4)
    if (chunk === 'VP8X' && bytes.length >= 30 && view.getUint32(16, true) === 10) return readImageSize({ width: 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16), height: 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16) })
    if (chunk === 'VP8 ' && bytes.length >= 30 && view.getUint32(16, true) >= 10 && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return readImageSize({ width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 })
    if (chunk === 'VP8L' && bytes.length >= 25 && view.getUint32(16, true) >= 5 && bytes[20] === 47) {
      const bits = view.getUint32(21, true)
      return readImageSize({ width: 1 + (bits & 16383), height: 1 + ((bits >>> 14) & 16383) })
    }
  }
  throw new Error('Не удалось прочитать размеры изображения')
}

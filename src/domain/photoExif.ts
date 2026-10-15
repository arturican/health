/** Only inspect JPEG marker segments; compressed pixels may contain arbitrary bytes. */
export function assertPhotoWithoutExif(bytes: Uint8Array): void {
  const malformed = () => new Error('Не удалось проверить метаданные JPEG')
  if (bytes[0] !== 255 || bytes[1] !== 216) throw malformed()
  let offset = 2
  let inScan = false
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 255) {
      if (inScan) { offset++; continue }
      throw malformed()
    }
    while (bytes[offset] === 255) offset++
    const marker = bytes[offset++]
    if (marker === undefined) throw malformed()
    if (marker === 217) {
      if (offset !== bytes.length) throw malformed()
      return
    }
    if (inScan && marker === 0) continue // Byte-stuffed 0xff belongs to compressed pixels.
    if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
    if (length < 2 || offset + length > bytes.length) throw malformed()
    if (marker === 225 && length >= 8 && [69, 120, 105, 102, 0, 0].every((value, index) => bytes[offset + 2 + index] === value)) {
      throw new Error('Подготовленное фото в копии содержит EXIF')
    }
    offset += length
    inScan = marker === 218
  }
  throw malformed()
}

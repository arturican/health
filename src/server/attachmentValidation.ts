import sharp from 'sharp'
import { z } from 'zod'
import { attachmentMimes, attachmentPurposeSchema, checkAttachment, DOCUMENT_MAX_BYTES, PHOTO_MAX_BYTES } from '../domain/attachment'
import { IMAGE_MAX_PIXELS, PHOTO_MAX_SIDE, readImageSize } from '../domain/imageGeometry'
import { imageHeaderSize } from '../domain/imageHeader'
import { DataError } from './httpErrors.js'

export async function validateServerAttachment(input: unknown, purposeInput: unknown, mimeInput: unknown) {
  try {
    if (!Buffer.isBuffer(input)) throw new Error('Нет байтов файла')
    const purpose = attachmentPurposeSchema.parse(purposeInput)
    if (input.length === 0 || input.length > (purpose === 'photo' ? PHOTO_MAX_BYTES : DOCUMENT_MAX_BYTES)) throw new Error('Размер файла вне предела')
    const mime = z.enum(attachmentMimes).parse(mimeInput)
    const checked = await checkAttachment(new Blob([new Uint8Array(input)], { type: mime }), purpose)
    if (checked.mime === 'application/pdf') return { bytes: input, purpose, mime, size: checked.size, dimensions: null }
    const header = imageHeaderSize(input, mime)
    const decoder = sharp(input, { limitInputPixels: IMAGE_MAX_PIXELS, failOn: 'warning', sequentialRead: true })
    try {
      const metadata = await decoder.metadata()
      const rawSize = readImageSize({ width: metadata.width, height: metadata.height })
      if (header.width !== rawSize.width || header.height !== rawSize.height) throw new Error('Размеры не совпадают')
      const swap = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8
      const dimensions = swap ? { width: rawSize.height, height: rawSize.width } : rawSize
      if (purpose === 'photo' && Math.max(dimensions.width, dimensions.height) > PHOTO_MAX_SIDE) throw new Error('Фото не подготовлено')
      // Декодирование обязательно: заголовок не выявляет повреждённые пиксели.
      // Малый выход не заменяет исходные байты документа.
      await decoder.resize(1, 1).raw().toBuffer()
      return { bytes: input, purpose, mime, size: checked.size, dimensions }
    } finally { decoder.destroy() }
  } catch { throw new DataError(400) }
}

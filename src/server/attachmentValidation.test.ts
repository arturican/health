// @vitest-environment node
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { DOCUMENT_MAX_BYTES, PHOTO_MAX_BYTES } from '../domain/attachment'
import { validateServerAttachment } from './attachmentValidation'

const image = (width = 8, height = 6) => sharp({ create: { width, height, channels: 3, background: { r: 30, g: 100, b: 170 } } })

it.each(['jpeg', 'png', 'webp'] as const)('декодирует синтетический %s, сохраняя исходные байты', async format => {
  const bytes = await image().toFormat(format).toBuffer()
  for (const purpose of ['photo', 'document']) {
    const file = await validateServerAttachment(bytes, purpose, `image/${format}`)
    expect(file.bytes).toEqual(bytes)
    expect(file.dimensions).toEqual({ width: 8, height: 6 })
    expect(file.size).toBe(bytes.length)
  }
})

it('разрешает PDF только документу и проверяет контейнер/MIME', async () => {
  const bytes = Buffer.from('%PDF-1.7\n% Synthetic test only\n%%EOF\n')
  expect((await validateServerAttachment(bytes, 'document', 'application/pdf')).bytes).toEqual(bytes)
  await expect(validateServerAttachment(bytes, 'photo', 'application/pdf')).rejects.toMatchObject({ statusCode: 400 })
  await expect(validateServerAttachment(bytes, 'document', 'image/jpeg')).rejects.toMatchObject({ statusCode: 400 })
  await expect(validateServerAttachment(bytes.subarray(0, bytes.length - 5), 'document', 'application/pdf')).rejects.toMatchObject({ statusCode: 400 })
})

it('отклоняет пустые, слишком большие и неподдерживаемые данные', async () => {
  for (const [bytes, purpose, mime] of [
    [Buffer.alloc(0), 'photo', 'image/jpeg'],
    [Buffer.alloc(PHOTO_MAX_BYTES + 1), 'photo', 'image/jpeg'],
    [Buffer.alloc(DOCUMENT_MAX_BYTES + 1), 'document', 'application/pdf'],
    [Buffer.from('<svg></svg>'), 'photo', 'image/svg+xml'],
    [new Uint8Array([1]), 'document', 'image/png'],
    [Buffer.from([1]), 'other', 'image/png'],
  ]) await expect(validateServerAttachment(bytes, purpose, mime)).rejects.toMatchObject({ statusCode: 400 })
})

it('проверяет лимит стороны фото, размеры документа и EXIF-ориентацию', async () => {
  const large = await image(2049, 1).png().toBuffer()
  await expect(validateServerAttachment(large, 'photo', 'image/png')).rejects.toMatchObject({ statusCode: 400 })
  expect((await validateServerAttachment(large, 'document', 'image/png')).dimensions).toEqual({ width: 2049, height: 1 })
  const oriented = await image().withMetadata({ orientation: 6 }).jpeg().toBuffer()
  expect((await validateServerAttachment(oriented, 'photo', 'image/jpeg')).dimensions).toEqual({ width: 6, height: 8 })
  const forged = Buffer.from(large)
  forged.writeUInt32BE(32768, 16)
  forged.writeUInt32BE(32768, 20)
  await expect(validateServerAttachment(forged, 'document', 'image/png')).rejects.toMatchObject({ statusCode: 400 })
})

it('отклоняет обрезку и повреждённые пиксели при сохранных сигнатурах и размере', async () => {
  const bytes = await image().png().toBuffer()
  await expect(validateServerAttachment(bytes.subarray(0, bytes.length - 1), 'document', 'image/png')).rejects.toMatchObject({ statusCode: 400 })
  const corrupted = Buffer.from(bytes)
  const offset = corrupted.indexOf('IDAT')
  expect(offset).toBeGreaterThan(0)
  corrupted[offset + 5] = 255
  await expect(validateServerAttachment(corrupted, 'document', 'image/png')).rejects.toMatchObject({ statusCode: 400 })
})

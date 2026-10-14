import { z } from 'zod'
import { validate } from './schema'

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024
export const attachmentPurposeSchema = z.enum(['photo', 'document'])
export type AttachmentPurpose = z.infer<typeof attachmentPurposeSchema>
export const attachmentMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type AttachmentMime = typeof attachmentMimes[number]
export interface CheckedAttachment { blob: Blob; mime: AttachmentMime; size: number }

function matches(bytes: Uint8Array, expected: readonly number[] | Uint8Array, offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value)
}
function ascii(bytes: Uint8Array, text: string, offset = 0) {
  return matches(bytes, new TextEncoder().encode(text), offset)
}
function detect(bytes: Uint8Array): AttachmentMime | null {
  if (matches(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png'
  if (matches(bytes, [255, 216, 255])) return 'image/jpeg'
  if (bytes.length >= 20 && ascii(bytes, 'RIFF') && ascii(bytes, 'WEBP', 8) && ['VP8 ', 'VP8L', 'VP8X'].some(chunk => ascii(bytes, chunk, 12))) return 'image/webp'
  if ((bytes[8] === 10 || bytes[8] === 13) && /^%PDF-(?:1\.[0-7]|2\.0)$/.test(new TextDecoder('ascii').decode(bytes.slice(0, 8)))) return 'application/pdf'
  return null
}

export async function checkAttachment(input: unknown, purposeInput: unknown): Promise<CheckedAttachment> {
  const purpose = validate(attachmentPurposeSchema, purposeInput)
  if (!(input instanceof Blob)) throw new Error('Выберите файл вложения')
  const limit = purpose === 'photo' ? PHOTO_MAX_BYTES : DOCUMENT_MAX_BYTES
  if (input.size === 0) throw new Error('Файл пуст')
  if (input.size > limit) throw new Error(`Размер файла превышает ${purpose === 'photo' ? '10' : '20'} MiB`)
  let header: Uint8Array
  let ending: Uint8Array
  try {
    header = new Uint8Array(await input.slice(0, 32).arrayBuffer())
    ending = new Uint8Array(await input.slice(Math.max(0, input.size - 1024)).arrayBuffer())
  } catch {
    throw new Error('Не удалось прочитать вложение')
  }
  const mime = detect(header)
  if (mime === null || (purpose === 'photo' && mime === 'application/pdf')) throw new Error('Неподдерживаемый формат вложения')
  if (input.type && input.type !== mime) throw new Error('MIME файла не соответствует содержимому')
  const validEnd = mime === 'image/jpeg' ? matches(ending, [255, 217], ending.length - 2)
    : mime === 'image/png' ? matches(ending, [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130], ending.length - 12)
      : mime === 'image/webp' ? validWebpSize(header, input.size)
        : new TextDecoder('ascii').decode(ending).trimEnd().endsWith('%%EOF')
  if (!validEnd) throw new Error('Файл повреждён или обрезан')
  return { blob: input.type === mime ? input : new Blob([input], { type: mime }), mime, size: input.size }
}

function validWebpSize(header: Uint8Array, size: number) {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const chunkSize = view.getUint32(16, true)
  return view.getUint32(4, true) + 8 === size && chunkSize > 0 && 20 + chunkSize + chunkSize % 2 <= size
}

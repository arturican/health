import { z } from 'zod'
import { validate } from './schema'

export const IMAGE_MAX_PIXELS = 64000000
export const PHOTO_MAX_SIDE = 2048
const imageSizeSchema = z.strictObject({ width: z.number().int().min(1).max(32768), height: z.number().int().min(1).max(32768) })
export type ImageSize = z.infer<typeof imageSizeSchema>

export function readImageSize(input: unknown): ImageSize {
  const size = validate(imageSizeSchema, input)
  if (size.width * size.height > IMAGE_MAX_PIXELS) throw new Error('Изображение превышает 64 млн пикселей')
  return size
}

export function photoSize(input: unknown): ImageSize {
  const size = readImageSize(input)
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(size.width, size.height))
  if (Math.min(size.width, size.height) * scale < 1) throw new Error('Фото слишком узкое для уменьшения до 2048 px')
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
}

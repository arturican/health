import { checkAttachment } from '../domain/attachment'
import { readStoredFile } from '../domain/storedFile'
import { readPhoto, type Photo } from '../domain/photo'
import { imageHeaderSize } from '../domain/imageHeader'
import { readImageSize } from '../domain/imageGeometry'

export async function checkBackupFile(input: unknown, photo?: Photo): Promise<Uint8Array<ArrayBuffer>> {
  const file = readStoredFile(input)
  const expected = file.purpose === 'photo' ? readPhoto(photo) : null
  if (expected && (expected.fileId !== file.id || file.mime !== 'image/jpeg')) throw new Error('Нарушена связь фотографии с файлом')
  await checkAttachment(file.blob, file.purpose)
  let bytes: Uint8Array<ArrayBuffer>
  try { bytes = new Uint8Array(await file.blob.arrayBuffer()) }
  catch { throw new Error('Не удалось прочитать файл копии') }
  if (file.mime === 'application/pdf') return bytes
  const header = imageHeaderSize(bytes, file.mime)
  if (expected && (header.width !== expected.width || header.height !== expected.height)) throw new Error('Размеры фото не совпадают с карточкой')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file.blob, { imageOrientation: 'from-image' }) }
  catch { throw new Error('Не удалось декодировать изображение копии') }
  try {
    const size = readImageSize({ width: bitmap.width, height: bitmap.height })
    if (expected && (size.width !== expected.width || size.height !== expected.height)) throw new Error('Размеры фото не совпадают с карточкой')
  } finally { bitmap.close() }
  return bytes
}

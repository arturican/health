import { prepareFile } from './prepareFile'
import { imageHeaderSize } from '../domain/imageHeader'
import { readImageSize } from '../domain/imageGeometry'

export async function prepareDocument(input: unknown) {
  const file = await prepareFile(input, 'document')
  if (file.mime === 'application/pdf') return file
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await file.blob.arrayBuffer()) }
  catch { throw new Error('Не удалось прочитать изображение документа') }
  readImageSize(imageHeaderSize(bytes, file.mime))
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file.blob, { imageOrientation: 'from-image' }) }
  catch { throw new Error('Не удалось декодировать изображение документа') }
  try { readImageSize({ width: bitmap.width, height: bitmap.height }) }
  finally { bitmap.close() }
  return file
}

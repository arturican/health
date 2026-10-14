import { checkAttachment } from '../domain/attachment'
import { imageHeaderSize } from '../domain/imageHeader'
import { photoSize, type ImageSize } from '../domain/imageGeometry'

export interface PreparedPhoto extends ImageSize { blob: Blob }

export async function preparePhoto(input: unknown): Promise<PreparedPhoto> {
  const file = await checkAttachment(input, 'photo')
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await file.blob.arrayBuffer()) }
  catch { throw new Error('Не удалось прочитать фото') }
  photoSize(imageHeaderSize(bytes, file.mime))
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file.blob, { imageOrientation: 'from-image' }) }
  catch { throw new Error('Не удалось декодировать фото') }
  try {
    const size = photoSize({ width: bitmap.width, height: bitmap.height })
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Обработка фото недоступна в браузере')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => { if (result) resolve(result); else reject(new Error('Не удалось подготовить фото')) }, 'image/jpeg', 0.9)
    })
    if (blob.type !== 'image/jpeg') throw new Error('Браузер не поддерживает сохранение JPEG')
    await checkAttachment(blob, 'photo')
    return { ...size, blob }
  } catch { throw new Error('Не удалось подготовить фото в браузере') }
  finally { bitmap.close() }
}

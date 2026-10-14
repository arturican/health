import { afterEach, expect, test, vi } from 'vitest'
import { preparePhoto } from './preparePhoto'

afterEach(() => { vi.restoreAllMocks() })

async function image(width: number, height: number, mime: string, transparent = false) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического образца нужен Canvas')
  if (!transparent) {
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, width / 2, height)
  }
  context.fillStyle = transparent ? '#00ff00' : '#0000ff'
  context.fillRect(width / 2, 0, width / 2, height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетический образец не создан')) }, mime, 0.9)
  })
}

async function samples(blob: Blob, points: readonly [number, number][]) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Для чтения синтетических пикселей нужен Canvas')
    context.drawImage(bitmap, 0, 0)
    return { width: bitmap.width, height: bitmap.height, colors: points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data)) }
  } finally { bitmap.close() }
}

function expectRedAndBlue(colors: number[][]) {
  expect(colors[0]?.[0]).toBeGreaterThan(240)
  expect(colors[0]?.[2]).toBeLessThan(20)
  expect(colors[1]?.[2]).toBeGreaterThan(240)
  expect(colors[1]?.[0]).toBeLessThan(20)
}

test('Canvas JPEG, PNG и WebP уменьшаются в читаемый JPEG с прежними пропорциями и цветами', async () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const source = await image(3072, 1536, mime)
    expect(source.type).toBe(mime)
    const result = await preparePhoto(source)
    expect({ width: result.width, height: result.height }).toEqual({ width: 2048, height: 1024 })
    expect(result.blob.type).toBe('image/jpeg')
    const decoded = await samples(result.blob, [[100, 100], [1900, 900]])
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: result.width, height: result.height })
    expectRedAndBlue(decoded.colors)
  }
})

test('EXIF-поворот сохраняется в пикселях без метаданных, прозрачный PNG получает белый фон', async () => {
  const source = new Uint8Array(await (await image(48, 24, 'image/jpeg')).arrayBuffer())
  const segment = new Uint8Array(36)
  segment.set([255, 225, 0, 34])
  segment.set(new TextEncoder().encode('Exif\0\0'), 4)
  const tiff = new DataView(segment.buffer, 10)
  tiff.setUint16(0, 0x4949, true)
  tiff.setUint16(2, 42, true)
  tiff.setUint32(4, 8, true)
  tiff.setUint16(8, 1, true)
  tiff.setUint16(10, 274, true)
  tiff.setUint16(12, 3, true)
  tiff.setUint32(14, 1, true)
  tiff.setUint16(18, 6, true)
  const oriented = new Blob([source.slice(0, 2), segment, source.slice(2)], { type: 'image/jpeg' })
  const before = await samples(oriented, [[12, 8], [12, 40]])
  expect({ width: before.width, height: before.height }).toEqual({ width: 24, height: 48 })
  expectRedAndBlue(before.colors)
  const prepared = await preparePhoto(oriented)
  expect({ width: prepared.width, height: prepared.height }).toEqual({ width: 24, height: 48 })
  expect(new TextDecoder('latin1').decode(await oriented.arrayBuffer())).toContain('Exif\0\0')
  expect(new TextDecoder('latin1').decode(await prepared.blob.arrayBuffer())).not.toContain('Exif\0\0')
  const after = await samples(prepared.blob, [[12, 8], [12, 40]])
  expect({ width: after.width, height: after.height }).toEqual({ width: 24, height: 48 })
  expectRedAndBlue(after.colors)

  const transparent = await image(32, 16, 'image/png', true)
  expect((await samples(transparent, [[4, 8]])).colors[0]?.[3]).toBe(0)
  const flattened = await preparePhoto(transparent)
  expect({ width: flattened.width, height: flattened.height }).toEqual({ width: 32, height: 16 })
  const pixels = await samples(flattened.blob, [[4, 8], [24, 8]])
  expect(pixels.colors[0]?.[0]).toBeGreaterThan(245)
  expect(pixels.colors[0]?.[1]).toBeGreaterThan(245)
  expect(pixels.colors[0]?.[2]).toBeGreaterThan(245)
  expect(pixels.colors[0]?.[3]).toBe(255)
  expect(pixels.colors[1]?.[1]).toBeGreaterThan(240)
  expect(pixels.colors[1]?.[0]).toBeLessThan(20)
})

test('повреждённые и чрезмерные заголовки отклоняются до Bitmap, ошибка настоящего декодера остаётся общей', async () => {
  const png = new Uint8Array(await (await image(32, 16, 'image/png')).arrayBuffer())
  const decode = vi.spyOn(globalThis, 'createImageBitmap')
  const excessive = png.slice()
  const dimensions = new DataView(excessive.buffer)
  dimensions.setUint32(16, 9000)
  dimensions.setUint32(20, 8000)
  await expect(preparePhoto(new Blob([excessive], { type: 'image/png' }))).rejects.toThrow('Изображение превышает 64 млн пикселей')
  expect(decode).not.toHaveBeenCalled()
  const malformed = png.slice()
  malformed.set(new TextEncoder().encode('BADD'), 12)
  await expect(preparePhoto(new Blob([malformed], { type: 'image/png' }))).rejects.toThrow()
  expect(decode).not.toHaveBeenCalled()
  const noPixels = new Blob([png.slice(0, 33), png.slice(-12)], { type: 'image/png' })
  await expect(preparePhoto(noPixels)).rejects.toThrow(/^Не удалось декодировать фото$/)
  expect(decode).toHaveBeenCalledTimes(1)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})

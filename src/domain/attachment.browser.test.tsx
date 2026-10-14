import { expect, test } from 'vitest'
import { checkAttachment, DOCUMENT_MAX_BYTES, PHOTO_MAX_BYTES, type AttachmentMime } from './attachment'

const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 83, 89, 255, 217])
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
const pdf = new TextEncoder().encode('%PDF-1.7\nsynthetic-body\n%%EOF\n')
const webp = new Uint8Array(24)
webp.set(new TextEncoder().encode('RIFF'))
webp.set(new TextEncoder().encode('WEBPVP8L'), 8)
new DataView(webp.buffer).setUint32(4, webp.length - 8, true)
new DataView(webp.buffer).setUint32(16, 4, true)
webp.set([47, 0, 0, 0], 20)
const formats: { mime: AttachmentMime; bytes: Uint8Array<ArrayBuffer> }[] = [
  { mime: 'image/jpeg', bytes: jpeg }, { mime: 'image/png', bytes: png },
  { mime: 'image/webp', bytes: webp }, { mime: 'application/pdf', bytes: pdf },
]

test('настоящие File и Blob распознаются по байтам и сохраняются с каноническим MIME без изменения содержимого', async () => {
  for (const { mime, bytes } of formats) {
    const file = new File([bytes], 'synthetic-misleading.txt', { type: '' })
    const purpose = mime === 'application/pdf' ? 'document' : 'photo'
    const result = await checkAttachment(file, purpose)
    expect(file).toBeInstanceOf(Blob)
    expect(result.mime).toBe(mime)
    expect(result.size).toBe(bytes.length)
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.type).toBe(mime)
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes)
    const declared = new Blob([bytes], { type: mime })
    const document = await checkAttachment(declared, 'document')
    expect(document.mime).toBe(mime)
    expect(document.blob.type).toBe(mime)
    expect(new Uint8Array(await document.blob.arrayBuffer())).toEqual(bytes)
  }
})

test('Chrome-файлы с подменой MIME, активным содержимым или повреждёнными границами отклоняются', async () => {
  await expect(checkAttachment(new File([jpeg], 'synthetic.jpg', { type: 'image/png' }), 'photo')).rejects.toThrow('MIME файла не соответствует содержимому')
  for (const content of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', '<html><script>synthetic()</script></html>', new Uint8Array([77, 90, 80, 69])]) {
    await expect(checkAttachment(new File([content], 'synthetic.png', { type: 'image/png' }), 'photo')).rejects.toThrow('Неподдерживаемый формат вложения')
  }
  for (const { mime, bytes } of formats) {
    const truncated = mime === 'application/pdf' ? new TextEncoder().encode('%PDF-1.7\nsynthetic-body\n%%EO') : bytes.slice(0, -1)
    await expect(checkAttachment(new Blob([truncated], { type: mime }), 'document')).rejects.toThrow('Файл повреждён или обрезан')
  }
  await expect(checkAttachment(new Blob([pdf], { type: 'application/pdf' }), 'photo')).rejects.toThrow('Неподдерживаемый формат вложения')
  for (const header of ['%PDF-1.70\n%%EOF', '%PDF-1.7evil\n%%EOF']) {
    await expect(checkAttachment(new Blob([header], { type: 'application/pdf' }), 'document')).rejects.toThrow('Неподдерживаемый формат вложения')
  }
})

test('нативные Blob проходят точные лимиты, превышение отклоняется до чтения, ошибка чтения остаётся общей', async () => {
  const exactPhoto = new Blob([jpeg.slice(0, -2), new Uint8Array(PHOTO_MAX_BYTES - jpeg.length), jpeg.slice(-2)], { type: 'image/jpeg' })
  const header = new TextEncoder().encode('%PDF-1.7\n')
  const ending = new TextEncoder().encode('%%EOF\n')
  const exactDocument = new Blob([header, new Uint8Array(DOCUMENT_MAX_BYTES - header.length - ending.length), ending], { type: 'application/pdf' })
  expect((await checkAttachment(exactPhoto, 'photo')).size).toBe(PHOTO_MAX_BYTES)
  expect((await checkAttachment(exactDocument, 'document')).size).toBe(DOCUMENT_MAX_BYTES)
  class UnreadableFile extends File {
    override slice(): Blob { throw new DOMException('Синтетическая закрытая подробность', 'NotReadableError') }
  }
  await expect(checkAttachment(new UnreadableFile([exactPhoto, new Uint8Array(1)], 'synthetic-too-large.jpg'), 'photo')).rejects.toThrow('Размер файла превышает 10 MiB')
  await expect(checkAttachment(new UnreadableFile([exactDocument, new Uint8Array(1)], 'synthetic-too-large.pdf'), 'document')).rejects.toThrow('Размер файла превышает 20 MiB')
  await expect(checkAttachment(new Blob(), 'document')).rejects.toThrow('Файл пуст')
  await expect(checkAttachment(new UnreadableFile([jpeg], 'synthetic-unreadable.jpg'), 'photo')).rejects.toThrow(/^Не удалось прочитать вложение$/)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})

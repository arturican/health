import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { decodeBase64, encodeBase64, isCanonicalBase64 } from './base64'
import { readFullBackup, serializeFullBackup, type FullBackup } from './fullBackup'
import { preparePhoto } from '../media/preparePhoto'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function syntheticPhoto() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического фото нужен Canvas')
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, 64, 32)
  const source = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетический PNG не создан')) }, 'image/png')
  })
  return preparePhoto(source)
}

test('полный JSON переносит настоящий JPEG/PDF и Unicode-метаданные с точными исходными байтами', async () => {
  const prepared = await syntheticPhoto()
  const pdf = new Blob(['%PDF-1.7\nsynthetic-данные-образца\n%%EOF\n'], { type: 'application/pdf' })
  const photoFileId = crypto.randomUUID()
  const documentFileId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const jpegBytes = new Uint8Array(await prepared.blob.arrayBuffer())
  const pdfBytes = new Uint8Array(await pdf.arrayBuffer())
  const backup: FullBackup = {
    format: 'health-diary-full', version: 1,
    text: {
      format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z', profile: null,
      weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [],
    },
    metadata: [{ id: 'catalog-seeded', value: 'done' }, { id: 'synthetic-note', value: 'Синтетическая заметка: ≤, ≥, символ 🧪' }],
    photos: [{ id: crypto.randomUUID(), fileId: photoFileId, date: '2026-10-14', title: 'Синтетическая зелёная геометрия', note: 'Без личных данных', width: prepared.width, height: prepared.height }],
    documents: [{ id: documentId, fileId: documentFileId, date: '2026-10-13', title: 'Синтетический бланк PDF', kind: 'lab', note: 'Оригинал без изменений' }],
    labResults: [{ id: crypto.randomUUID(), documentId, date: '2026-10-13', name: 'Синтетический нулевой показатель', value: { type: 'number', number: 0, operator: 'lte' }, unit: 'условные единицы', reference: '≤ 0,0000002; как на бланке', note: 'Без интерпретации' }],
    files: [
      { id: photoFileId, purpose: 'photo', mime: 'image/jpeg', size: prepared.blob.size, base64: encodeBase64(jpegBytes) },
      { id: documentFileId, purpose: 'document', mime: 'application/pdf', size: pdf.size, base64: encodeBase64(pdfBytes) },
    ],
  }
  expect(readFullBackup(backup)).toEqual(backup)
  const json = serializeFullBackup(backup)
  const parsed: unknown = JSON.parse(json)
  const restored = readFullBackup(parsed)
  expect(restored).toEqual(backup)
  expect(json).toContain('Синтетическая заметка: ≤, ≥, символ 🧪')
  for (const file of restored.files) {
    const decoded = decodeBase64(file.base64, file.size)
    const bytes = file.purpose === 'photo' ? jpegBytes : pdfBytes
    expect(decoded).toEqual(bytes)
    const buffer = new ArrayBuffer(decoded.byteLength)
    new Uint8Array(buffer).set(decoded)
    const blob = new Blob([buffer], { type: file.mime })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe(file.mime)
    expect(blob.size).toBe(file.size)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
    if (file.purpose === 'photo') {
      const bitmap = await createImageBitmap(blob)
      try {
        expect([bitmap.width, bitmap.height]).toEqual([64, 32])
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Для проверки синтетического пикселя нужен Canvas')
        context.drawImage(bitmap, 32, 16, 1, 1, 0, 0, 1, 1)
        const pixel = context.getImageData(0, 0, 1, 1).data
        expect(pixel[1]).toBeGreaterThan(240)
        expect(pixel[0]).toBeLessThan(20)
        expect(pixel[2]).toBeLessThan(20)
      } finally { bitmap.close() }
    }
  }
})

test('Base64 проходит границы чанков со всеми 256 байтами и отвергает неканонические строки', () => {
  for (const length of [1, 2, 3, 32765, 32766, 32767, 65533, 65534, 131071]) {
    const bytes = Uint8Array.from({ length }, (_, index) => index % 256)
    const expected = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    const encoded = encodeBase64(bytes)
    expect(encoded).toBe(expected)
    expect(isCanonicalBase64(encoded, length)).toBe(true)
    expect(decodeBase64(encoded, length)).toEqual(bytes)
  }
  const invalid: [string, number][] = [['AB==', 1], ['AAB=', 2], ['AA==\n', 1], ['AAAA', 1], ['AA=A', 3], ['éA==', 1], ['ＡA==', 1]]
  for (const [encoded, size] of invalid) {
    expect(isCanonicalBase64(encoded, size)).toBe(false)
    expect(() => decodeBase64(encoded, size)).toThrow(/^Некорректные данные Base64 файла$/)
  }
})

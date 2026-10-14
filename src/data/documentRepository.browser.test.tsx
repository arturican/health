import Dexie from 'dexie'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { addDocument, listDocuments } from './documentRepository'
import { getFile, prepareFile } from './fileRepository'
import { preparePhoto } from '../media/preparePhoto'
import type { Photo } from '../domain/photo'
import type { DiaryDocument } from '../domain/document'

const input = { date: '2026-10-14', title: 'Синтетический документ', kind: 'other', note: '' }
const pdf = new File(['%PDF-1.7\nsynthetic-document\n%%EOF\n'], 'synthetic-document.txt', { type: '' })
const connections: Dexie[] = []
function createDatabase(name = `health-diary-test-documents-browser-${crypto.randomUUID()}`) {
  expect(import.meta.env.MODE).toBe('test')
  expect(name.startsWith('health-diary-test-documents-browser-')).toBe(true)
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function syntheticImage(mime: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 80
  canvas.height = 40
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического документа нужен Canvas')
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, 80, 40)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетическое изображение не создано')) }, mime, 0.9)
  })
}

test('настоящие PDF/JPEG/PNG/WebP сохраняют исходные байты после reopen, декодер закрывает bitmap', async () => {
  const database = createDatabase()
  const decode = vi.spyOn(globalThis, 'createImageBitmap')
  const sources = [pdf, await syntheticImage('image/jpeg'), await syntheticImage('image/png'), await syntheticImage('image/webp')]
  const documents: DiaryDocument[] = []
  for (const [index, source] of sources.entries()) {
    const document = await addDocument({ ...input, title: `  Синтетический документ ${String(index)}  `, date: index === 0 ? '2026-10-13' : input.date }, source, database)
    documents.push(document)
    expect(document.title).toBe(`Синтетический документ ${String(index)}`)
    if (index > 0) {
      const closed: unknown = await decode.mock.results.at(-1)?.value
      if (!(closed instanceof ImageBitmap)) throw new Error('Нужен настоящий bitmap браузерного декодера')
      expect([closed.width, closed.height]).toEqual([0, 0])
    }
  }
  expect(decode).toHaveBeenCalledTimes(3)
  decode.mockRestore()
  expect(await listDocuments(database)).toEqual(expect.arrayContaining(documents))
  expect((await listDocuments(database)).at(-1)).toEqual(documents[0])
  database.close()
  const reopened = createDatabase(database.name)
  for (const [index, document] of documents.entries()) {
    const source = sources[index]
    const file = await getFile(document.fileId, reopened)
    if (!file || !source) throw new Error('Документ и синтетические байты должны сохраниться')
    expect(file.purpose).toBe('document')
    expect(file.mime).toBe(source.type || 'application/pdf')
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()))
    if (index > 0) {
      const bitmap = await createImageBitmap(file.blob)
      try { expect([bitmap.width, bitmap.height]).toEqual([80, 40]) }
      finally { bitmap.close() }
    }
  }
  expect(await reopened.documents.count()).toBe(4)
  expect(await reopened.files.count()).toBe(4)
})

test('повреждённые изображения и огромный заголовок не записываются, поздний отказ откатывает файл', async () => {
  const database = createDatabase()
  const png = new Uint8Array(await (await syntheticImage('image/png')).arrayBuffer())
  const decode = vi.spyOn(globalThis, 'createImageBitmap')
  const excessive = png.slice()
  new DataView(excessive.buffer).setUint32(16, 9000)
  new DataView(excessive.buffer).setUint32(20, 8000)
  await expect(addDocument(input, new Blob([excessive], { type: 'image/png' }), database)).rejects.toThrow('Изображение превышает 64 млн пикселей')
  expect(decode).not.toHaveBeenCalled()
  const malformed = png.slice()
  malformed.set(new TextEncoder().encode('BADD'), 12)
  await expect(addDocument(input, new Blob([malformed], { type: 'image/png' }), database)).rejects.toThrow()
  expect(decode).not.toHaveBeenCalled()
  const noPixels = new Blob([png.slice(0, 33), png.slice(-12)], { type: 'image/png' })
  await expect(addDocument(input, noPixels, database)).rejects.toThrow(/^Не удалось декодировать изображение документа$/)
  expect(decode).toHaveBeenCalledTimes(1)
  expect(await database.documents.count()).toBe(0)
  expect(await database.files.count()).toBe(0)
  let fileAttempted = false
  const observe = () => { fileAttempted = true }
  const failure = () => { throw new Error('Синтетический поздний отказ карточки') }
  database.files.hook('creating', observe)
  database.documents.hook('creating', failure)
  await expect(addDocument(input, pdf, database)).rejects.toThrow('Синтетический поздний отказ карточки')
  database.files.hook('creating').unsubscribe(observe)
  database.documents.hook('creating').unsubscribe(failure)
  expect(fileAttempted).toBe(true)
  expect(await database.documents.count()).toBe(0)
  expect(await database.files.count()).toBe(0)
  const retried = await addDocument(input, pdf, database)
  expect(await listDocuments(database)).toEqual([retried])
  expect(await database.files.count()).toBe(1)
})

test('нативная миграция v10 в v11 сохраняет фото и его Blob, добавляя документы и индекс fileId', async () => {
  const database = createDatabase()
  const previous = new Dexie(database.name)
  connections.push(previous)
  previous.version(10).stores({
    metadata: 'id', profiles: 'id', weights: 'id,&date', products: 'id,name', foodEntries: 'id,date,[date+meal]',
    nutritionDays: 'date', steps: 'date', workouts: 'id,date', energyPlans: 'id,effectiveFrom,&revision', files: 'id,purpose', photos: 'id,date,&fileId',
  })
  const prepared = await preparePhoto(await syntheticImage('image/png'))
  const legacyFile = await prepareFile(prepared.blob, 'photo')
  const photo: Photo = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-13', title: 'Синтетическое прежнее фото', note: '', fileId: legacyFile.id, width: prepared.width, height: prepared.height }
  const metadata = { id: 'synthetic-preserved', value: photo.id }
  await previous.table<unknown, string>('files').add(legacyFile)
  await previous.table<unknown, string>('photos').add(photo)
  await previous.table<unknown, string>('metadata').add(metadata)
  previous.close()
  expect(await database.documents.count()).toBe(0)
  expect(await database.photos.where('fileId').equals(photo.fileId).first()).toEqual(photo)
  const preserved = await getFile(photo.fileId, database)
  if (!preserved) throw new Error('Миграция должна сохранить файл синтетического фото')
  expect(new Uint8Array(await preserved.blob.arrayBuffer())).toEqual(new Uint8Array(await legacyFile.blob.arrayBuffer()))
  const document = await addDocument(input, pdf, database)
  expect(await database.documents.where('fileId').equals(document.fileId).first()).toEqual(document)
  expect(await database.photos.toArray()).toEqual([photo])
  expect(await database.metadata.toArray()).toEqual([metadata])
  expect(await database.files.count()).toBe(2)
})

import Dexie from 'dexie'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { getFile, prepareFile } from './fileRepository'
import { addPhoto, listPhotos } from './photoRepository'

const connections: Dexie[] = []
function createDatabase(name = `health-diary-test-photos-browser-${crypto.randomUUID()}`) {
  expect(import.meta.env.MODE).toBe('test')
  expect(name.startsWith('health-diary-test-photos-browser-')).toBe(true)
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

async function greenImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического фото нужен Canvas')
  context.fillStyle = '#00ff00'
  context.fillRect(0, 0, 64, 32)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетическое фото не создано')) }, 'image/png')
  })
}
async function expectGreenPixels(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  try {
    expect({ width: bitmap.width, height: bitmap.height }).toEqual({ width: 64, height: 32 })
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 32
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Для чтения синтетических пикселей нужен Canvas')
    context.drawImage(bitmap, 0, 0)
    const pixel = context.getImageData(32, 16, 1, 1).data
    expect(pixel[1]).toBeGreaterThan(240)
    expect(pixel[0]).toBeLessThan(20)
    expect(pixel[2]).toBeLessThan(20)
  } finally { bitmap.close() }
}

test('фото и подготовленный JPEG сохраняют метаданные, пиксели и связь после повторного открытия базы', async () => {
  const database = createDatabase()
  const photo = await addPhoto({ date: '2026-10-14', title: '  Синтетическое зелёное фото  ', note: '  Синтетическая заметка  ' }, await greenImage(), database)
  expect(photo).toMatchObject({ date: '2026-10-14', title: 'Синтетическое зелёное фото', note: 'Синтетическая заметка', width: 64, height: 32 })
  expect(photo.id).not.toBe(photo.fileId)
  expect(await listPhotos(database)).toEqual([photo])
  database.close()
  const reopened = createDatabase(database.name)
  expect(await listPhotos(reopened)).toEqual([photo])
  const file = await getFile(photo.fileId, reopened)
  if (!file) throw new Error('Файл синтетического фото должен сохраниться')
  expect(file).toMatchObject({ id: photo.fileId, purpose: 'photo', mime: 'image/jpeg' })
  expect(file.blob).toBeInstanceOf(Blob)
  expect(file.blob.type).toBe('image/jpeg')
  expect(file.size).toBe(file.blob.size)
  await expectGreenPixels(file.blob)
})

test('неверный ввод проверяется до декодирования, поздний отказ карточки откатывает уже записанный файл', async () => {
  const database = createDatabase()
  const source = await greenImage()
  const decode = vi.spyOn(globalThis, 'createImageBitmap')
  await expect(addPhoto({ date: '2026-10-15', title: 'Синтетическое фото', note: '' }, source, database)).rejects.toThrow('Дата фото не может быть в будущем')
  expect(decode).not.toHaveBeenCalled()
  decode.mockRestore()
  const fileModes: string[] = []
  const observe = () => { fileModes.push(Dexie.currentTransaction.mode) }
  const failure = () => { throw new Error('Синтетический поздний отказ карточки') }
  database.files.hook('creating', observe)
  database.photos.hook('creating', failure)
  await expect(addPhoto({ date: '2026-10-14', title: 'Синтетическое фото', note: '' }, source, database)).rejects.toThrow('Синтетический поздний отказ карточки')
  database.files.hook('creating').unsubscribe(observe)
  database.photos.hook('creating').unsubscribe(failure)
  expect(fileModes).toEqual(['readwrite'])
  expect(await database.files.count()).toBe(0)
  expect(await database.photos.count()).toBe(0)
  const photo = await addPhoto({ date: '2026-10-14', title: 'Синтетический повтор', note: '' }, source, database)
  expect(await database.files.count()).toBe(1)
  expect(await listPhotos(database)).toEqual([photo])
})

test('браузерная миграция v9 в v10 сохраняет прежний Blob и добавляет индекс связи фото', async () => {
  const database = createDatabase()
  const previous = new Dexie(database.name)
  connections.push(previous)
  previous.version(9).stores({
    metadata: 'id', profiles: 'id', weights: 'id,&date', products: 'id,name', foodEntries: 'id,date,[date+meal]',
    nutritionDays: 'date', steps: 'date', workouts: 'id,date', energyPlans: 'id,effectiveFrom,&revision', files: 'id,purpose',
  })
  const source = await greenImage()
  const legacy = await prepareFile(source, 'document')
  const metadata = { id: 'synthetic-preserved', value: legacy.id }
  await previous.table<unknown, string>('files').add(legacy)
  await previous.table<unknown, string>('metadata').add(metadata)
  previous.close()
  expect(await database.photos.count()).toBe(0)
  const preserved = await getFile(legacy.id, database)
  if (!preserved) throw new Error('Миграция должна сохранить синтетический файл')
  expect({ ...preserved, blob: null }).toEqual({ ...legacy, blob: null })
  expect(new Uint8Array(await preserved.blob.arrayBuffer())).toEqual(new Uint8Array(await source.arrayBuffer()))
  await expectGreenPixels(preserved.blob)
  const photo = await addPhoto({ date: '2026-10-14', title: 'Синтетическое фото после миграции', note: '' }, source, database)
  expect(await database.photos.where('fileId').equals(photo.fileId).first()).toEqual(photo)
  expect(await database.files.count()).toBe(2)
  expect(await database.metadata.toArray()).toEqual([metadata])
  expect(await getFile(legacy.id, database)).toMatchObject({ id: legacy.id, purpose: 'document', mime: 'image/png' })
})

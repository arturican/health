import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { exportFullBackup } from './fullBackupRepository'
import { restoreTextBackup } from './backupRepository'
import * as media from '../media/checkBackupFile'
import { encodeBase64 } from '../domain/base64'
import type { TextBackup } from '../domain/backup'
import type { FullBackup } from '../domain/fullBackup'
import type { StoredFile } from '../domain/storedFile'
import type { Photo } from '../domain/photo'
import type { DiaryDocument } from '../domain/document'
import type { LabResult } from '../domain/labResult'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const text: TextBackup = {
  format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
  profile: { id: 'self', name: 'Синтетический профиль', heightCm: 170, birthDate: null, formulaSex: 'none' },
  weights: [{ id: id(101), date: '2026-10-12', kg: 70 }],
  products: [{ id: id(201), name: 'Синтетический продукт', source: '', kcal: 0, protein: 0, fat: null, carbs: 0, archived: false }],
  foodEntries: [{ id: id(301), productId: id(201), date: '2026-10-14', meal: 'lunch', grams: 100, note: '', snapshot: { name: 'Прежний синтетический продукт', source: '', kcal: 0, protein: 0, fat: null, carbs: 0 } }],
  nutritionDays: [{ date: '2026-10-14', complete: false }], steps: [{ date: '2026-10-14', count: 0 }],
  workouts: [{ id: id(401), date: '2026-10-14', kind: 'Синтетическая прогулка', minutes: 10, kcal: null, source: '', note: '' }],
  energyPlans: [{ id: id(402), revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-15', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70, weightDate: '2026-10-12', heightCm: 170, age: null, formulaSex: 'none' } }],
}
const emptyText: TextBackup = { ...text, profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] }
const metadata = [{ id: 'catalog-seeded', value: 'done' }, { id: 'fixture', value: 'Синтетическая настройка' }]
const photo: Photo = { id: id(501), fileId: id(701), date: '2026-10-12', title: 'Синтетическое фото', note: '', width: 320, height: 240 }
const document: DiaryDocument = { id: id(601), fileId: id(702), date: '2026-10-14', title: 'Синтетический бланк', kind: 'lab', note: '' }
const result: LabResult = { id: id(801), documentId: document.id, date: '2026-10-14', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' }
// The JPEG header is real SOF structure; pixel decoding itself is covered in Chromium.
const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 240, 1, 64, 1, 1, 17, 0, 255, 217])
const pdf = new Uint8Array(new TextEncoder().encode('%PDF-1.7\nSynthetic source\n%%EOF\n'))
function files(): StoredFile[] {
  return [
    { id: photo.fileId, purpose: 'photo', mime: 'image/jpeg', size: jpeg.length, blob: new Blob([jpeg], { type: 'image/jpeg' }) },
    { id: document.fileId, purpose: 'document', mime: 'application/pdf', size: pdf.length, blob: new Blob([pdf], { type: 'application/pdf' }) },
  ]
}
function expected(): FullBackup {
  return { format: 'health-diary-full', version: 1, text, metadata, photos: [photo], documents: [document], labResults: [result], files: files().map((file, index) => ({ id: file.id, purpose: file.purpose, mime: file.mime, size: file.size, base64: encodeBase64(index === 0 ? jpeg : pdf) })) }
}
const connections: DiaryDatabase[] = []
let sequence = 0
const closeBitmap = vi.fn<() => void>()
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-full-backup-${String(++sequence)}`)
  connections.push(database)
  return database
}
async function populate(database: DiaryDatabase) {
  await database.metadata.bulkAdd(metadata)
  if (text.profile) await database.profiles.add(text.profile)
  await database.weights.bulkAdd(text.weights)
  await database.products.bulkAdd(text.products)
  await database.foodEntries.bulkAdd(text.foodEntries)
  await database.nutritionDays.bulkAdd(text.nutritionDays)
  await database.steps.bulkAdd(text.steps)
  await database.workouts.bulkAdd(text.workouts)
  await database.energyPlans.bulkAdd(text.energyPlans)
  await database.files.bulkAdd(files())
  await database.photos.add(photo)
  await database.documents.add(document)
  await database.labResults.add(result)
}

beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob)
  vi.stubGlobal('createImageBitmap', vi.fn<typeof createImageBitmap>().mockImplementation(() => {
    expect(Dexie.currentTransaction).toBeNull()
    return Promise.resolve({ width: photo.width, height: photo.height, close: closeBitmap })
  }))
  closeBitmap.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(text.exportedAt))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('экспортирует пустую базу с явными неизвестными данными и всеми массивами', async () => {
  expect(await exportFullBackup(createDatabase())).toEqual({ format: 'health-diary-full', version: 1, text: emptyText, metadata: [], photos: [], documents: [], labResults: [], files: [] })
  expect(closeBitmap).not.toHaveBeenCalled()
})

it('после reopen читает все 13 таблиц одной физической readonly-транзакцией и проверяет байты вне неё', async () => {
  const original = createDatabase()
  await populate(original)
  original.close()
  const database = new DiaryDatabase(original.name)
  connections.push(database)
  const transactions = new Set<IDBTransaction>()
  const visited = new Set<string>()
  const unsubscribe: (() => void)[] = []
  for (const name of database.tables.map(table => table.name)) {
    const table = database.table<unknown, string>(name)
    function observe(value: unknown) {
      expect(Dexie.currentTransaction.mode).toBe('readonly')
      transactions.add(Dexie.currentTransaction.idbtrans)
      visited.add(name)
      return value
    }
    table.hook('reading', observe)
    unsubscribe.push(() => { table.hook('reading').unsubscribe(observe) })
  }
  const backup = await exportFullBackup(database)
  unsubscribe.forEach(remove => { remove() })
  expect(transactions.size).toBe(1)
  expect([...visited].sort()).toEqual(database.tables.map(table => table.name).sort())
  expect(visited.size).toBe(13)
  expect(backup).toEqual(expected())
  expect(closeBitmap).toHaveBeenCalledTimes(1)
  expect(await database.metadata.toArray()).toEqual(metadata)
  expect(await database.documents.toArray()).toEqual([document])
  expect(await database.labResults.toArray()).toEqual([result])
  expect(await database.files.count()).toBe(2)
})

it('изменения DB во время проверки файлов не меняют уже захваченный согласованный снимок', async () => {
  const database = createDatabase()
  await populate(database)
  const originalCheck = media.checkBackupFile
  vi.spyOn(media, 'checkBackupFile').mockImplementationOnce(async (input, card) => {
    expect(Dexie.currentTransaction).toBeNull()
    await database.transaction('rw', [database.profiles, database.steps, database.metadata, database.photos, database.documents, database.labResults, database.files], async () => {
      if (text.profile) await database.profiles.put({ ...text.profile, name: 'Изменено после снимка' })
      await database.steps.put({ date: '2026-10-14', count: 777 })
      await database.metadata.put({ id: 'fixture', value: 'Изменено после снимка' })
      await database.photos.put({ ...photo, title: 'Изменённая подпись' })
      await database.documents.put({ ...document, title: 'Изменённый бланк' })
      await database.labResults.put({ ...result, value: { type: 'text', text: 'Изменённый результат' } })
      const blob = new Blob(['%PDF-2.0\nChanged synthetic source\n%%EOF\n'], { type: 'application/pdf' })
      await database.files.put({ id: document.fileId, purpose: 'document', mime: 'application/pdf', size: blob.size, blob })
    })
    return originalCheck(input, card)
  })
  expect(await exportFullBackup(database)).toEqual(expected())
  expect((await database.profiles.get('self'))?.name).toBe('Изменено после снимка')
  expect((await database.documents.get(document.id))?.title).toBe('Изменённый бланк')
  expect((await database.labResults.get(result.id))?.value).toEqual({ type: 'text', text: 'Изменённый результат' })
  expect((await database.files.get(document.fileId))?.size).not.toBe(pdf.length)
})

it('текстовое восстановление сохраняет фото, документы, показатели и оригинальные байты полной копии', async () => {
  const database = createDatabase()
  await populate(database)
  await restoreTextBackup(emptyText, database)
  const backup = await exportFullBackup(database)
  expect(backup).toEqual({ ...expected(), text: emptyText, metadata: [metadata[1]] })
})

it('отвергает лишний профиль, потерянный source и бесхозный файл без исправления исходной базы', async () => {
  const database = createDatabase()
  await populate(database)
  const profile = text.profile
  if (!profile) throw new Error('Синтетический профиль отсутствует')
  await database.table<unknown, string>('profiles').add({ ...profile, id: 'foreign' })
  await expect(exportFullBackup(database)).rejects.toThrow('В дневнике поддерживается один профиль')
  expect(await database.profiles.count()).toBe(2)
  await database.profiles.delete('foreign')
  const corrupted = { ...result, documentId: id(999) }
  await database.labResults.put(corrupted)
  await expect(exportFullBackup(database)).rejects.toThrow('Отсутствует документ-источник показателя')
  expect(await database.labResults.get(result.id)).toEqual(corrupted)
  await database.labResults.put(result)
  const extra = { ...files()[1], id: id(999) }
  await database.table<unknown, string>('files').add(extra)
  await expect(exportFullBackup(database)).rejects.toThrow('Нарушены связи файлов полной копии')
  expect(await database.files.count()).toBe(3)
  expect(await database.documents.toArray()).toEqual([document])
})

it('повреждённые Blob или метаданные отклоняются без изменения файлов и раскрытия содержимого', async () => {
  const database = createDatabase()
  await populate(database)
  const blob = new Blob(['Синтетическое закрытое содержимое'], { type: 'application/pdf' })
  const corrupted: StoredFile = { id: document.fileId, purpose: 'document', mime: 'application/pdf', size: blob.size, blob }
  await database.files.put(corrupted)
  await expect(exportFullBackup(database)).rejects.toThrow('Неподдерживаемый формат вложения')
  expect((await database.files.get(document.fileId))?.size).toBe(blob.size)
  await database.table<unknown, string>('files').put({ ...corrupted, size: blob.size + 1 })
  await expect(exportFullBackup(database)).rejects.toThrow('Метаданные вложения не совпадают с файлом')
  expect((await database.files.get(document.fileId))?.size).toBe(blob.size + 1)
  expect(await database.photos.toArray()).toEqual([photo])
  expect(await database.documents.toArray()).toEqual([document])
  expect(await database.labResults.toArray()).toEqual([result])
})

it('экспортирует через повторно открытый default singleton только тестовую базу', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  await populate(db)
  expect(await exportFullBackup()).toEqual(expected())
})

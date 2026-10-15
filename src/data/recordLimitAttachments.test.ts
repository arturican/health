import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { prepareFile, savePreparedFile } from './fileRepository'
import { addDocument } from './documentRepository'
import { addPhoto } from './photoRepository'
import { saveVisibility, getVisibility } from './visibilityRepository'
import { seedProducts } from './productRepository'
import { DIARY_GENERATION_ID } from './clearDiary'
import { exportFullBackup, restoreFullBackup } from './fullBackupRepository'
import { readFullBackup } from '../domain/fullBackup'
import { DEFAULT_VISIBILITY, VISIBILITY_SETTING_ID } from '../domain/visibility'
import * as photoMedia from '../media/preparePhoto'

vi.mock('../domain/backup', async importOriginal => ({ ...await importOriginal<typeof import('../domain/backup')>(), BACKUP_MAX_RECORDS: 3 }))

const connections: DiaryDatabase[] = []
const values = { date: '2026-10-14', title: 'Синтетический документ', kind: 'other', note: '' }
const visibility = { version: 1, showPhotos: false, showDocuments: true }
const generation = { id: DIARY_GENERATION_ID, value: '00000000-0000-4000-8000-000000000999' }
const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 2, 0, 1, 1, 1, 17, 0, 255, 217])
function createDatabase(name = `health-diary-test-record-attachments-${crypto.randomUUID()}`) {
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
function pdf(label = '') { return new Blob([`%PDF-1.7\nSynthetic bounded attachment ${label}\n%%EOF\n`], { type: 'application/pdf' }) }
function metadata(count: number) { return Array.from({ length: count }, (_, index) => ({ id: `fixture-${String(index)}`, value: `Синтетическая настройка ${String(index)}` })) }
async function fileSnapshot(database: DiaryDatabase) {
  return Promise.all((await database.files.toArray()).map(async ({ blob, ...record }) => ({
    ...record, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
  })))
}
async function populateDocuments(database: DiaryDatabase, count: number) {
  for (let index = 0; index < count; index++) {
    await addDocument({ ...values, title: `${values.title} ${String(index)}` }, pdf(String(index)), database)
  }
}
beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob)
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1, height: 2, close: vi.fn() }))
  vi.spyOn(photoMedia, 'preparePhoto').mockResolvedValue({ blob: new Blob([jpeg], { type: 'image/jpeg' }), width: 1, height: 2 })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of connections) database.close()
  await Promise.all([...new Set(connections.map(database => database.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('четвёртый подготовленный файл отклоняется без изменения прежних трёх', async () => {
  const database = createDatabase()
  for (let index = 0; index < 3; index++) await savePreparedFile(await prepareFile(pdf(String(index)), 'document'), database)
  const before = await fileSnapshot(database)
  await expect(savePreparedFile(await prepareFile(pdf(), 'document'), database)).rejects.toThrow(/лимит/i)
  expect(await fileSnapshot(database)).toEqual(before)
})

it.each(['photo', 'document'])('при лимите файлов добавление %s не создаёт карточку или бесхозный файл и сохраняет прежние байты', async kind => {
  const database = createDatabase()
  await populateDocuments(database, 3)
  const before = await exportFullBackup(database)
  const bytes = await fileSnapshot(database)
  const task = kind === 'photo'
    ? addPhoto({ date: values.date, title: 'Синтетическое фото', note: '' }, new Blob([jpeg], { type: 'image/jpeg' }), database)
    : addDocument(values, pdf('rejected'), database)
  await expect(task).rejects.toThrow(/лимит/i)
  expect(await database.photos.count()).toBe(0)
  expect(await database.documents.count()).toBe(3)
  expect(await fileSnapshot(database)).toEqual(bytes)
  expect(await exportFullBackup(database)).toEqual(before)
})

it.each(['photo', 'document'])('конкурентные document и %s через два соединения создают только одну пару файл/владелец последнего слота', async kind => {
  const database = createDatabase()
  await populateDocuments(database, 2)
  const bytes = await fileSnapshot(database)
  const documents = await database.documents.toArray()
  const other = createDatabase(database.name)
  const second = kind === 'photo'
    ? addPhoto({ date: values.date, title: 'Синтетическое конкурентное фото', note: '' }, new Blob([jpeg], { type: 'image/jpeg' }), other)
    : addDocument({ ...values, title: 'Конкурентный синтетический документ' }, pdf('competitor'), other)
  const results = await Promise.allSettled([addDocument(values, pdf('last-slot'), database), second])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failures = results.filter(result => result.status === 'rejected')
  expect(failures).toHaveLength(1)
  const reason: unknown = failures[0]?.reason
  expect(reason).toBeInstanceOf(Error)
  if (!(reason instanceof Error)) throw new Error('Ожидался отказ лимита')
  expect(reason.message).toMatch(/лимит/i)
  expect(await fileSnapshot(database)).toEqual(expect.arrayContaining(bytes))
  expect(await database.documents.toArray()).toEqual(expect.arrayContaining(documents))
  const owners = [...await database.photos.toArray(), ...await database.documents.toArray()]
  const files = await database.files.toArray()
  expect(owners).toHaveLength(3)
  expect(files).toHaveLength(3)
  expect(new Set(owners.map(owner => owner.fileId))).toEqual(new Set(files.map(file => file.id)))
  const backup = await exportFullBackup(database)
  expect(readFullBackup(backup)).toEqual(backup)
  const destination = createDatabase()
  await restoreFullBackup(backup, destination)
  expect(await exportFullBackup(destination)).toEqual(backup)
})

it('новая видимость при трёх пользовательских metadata отклоняется, не меняя поколение и настройки', async () => {
  const database = createDatabase()
  await database.metadata.bulkAdd([generation, ...metadata(3)])
  const before = await database.metadata.toArray()
  await expect(saveVisibility(visibility, database)).rejects.toThrow(/лимит/i)
  expect(await database.metadata.toArray()).toEqual(before)
  expect(await getVisibility(database)).toEqual(DEFAULT_VISIBILITY)
})

it('изменяет существующую видимость при полном лимите пользовательских metadata', async () => {
  const database = createDatabase()
  const original = [...metadata(2), generation]
  await database.metadata.bulkAdd([...original, { id: VISIBILITY_SETTING_ID, value: JSON.stringify(DEFAULT_VISIBILITY) }])
  await saveVisibility(visibility, database)
  expect(await getVisibility(database)).toEqual(visibility)
  const actual = await database.metadata.toArray()
  expect(actual).toHaveLength(4)
  expect(actual.filter(row => row.id !== VISIBILITY_SETTING_ID)).toEqual(expect.arrayContaining(original))
  expect(actual.find(row => row.id === VISIBILITY_SETTING_ID)).toEqual({ id: VISIBILITY_SETTING_ID, value: JSON.stringify(visibility) })
})

it('служебное поколение не занимает последний слот новой видимости', async () => {
  const database = createDatabase()
  const original = [generation, ...metadata(2)]
  await database.metadata.bulkAdd(original)
  await saveVisibility(visibility, database)
  expect(await getVisibility(database)).toEqual(visibility)
  expect(await database.metadata.count()).toBe(4)
  expect(await database.metadata.toArray()).toEqual(expect.arrayContaining(original))
  expect((await exportFullBackup(database)).metadata).toHaveLength(3)
})

it.each([false, true])('конкурентные примеры и видимость не переполняют последний слот metadata, seedFirst=%s', async seedFirst => {
  const database = createDatabase()
  await database.metadata.bulkAdd([generation, ...metadata(2)])
  const other = createDatabase(database.name)
  const tasks = seedFirst ? [seedProducts(database), saveVisibility(visibility, other)] : [saveVisibility(visibility, database), seedProducts(other)]
  const results = await Promise.allSettled(tasks)
  expect(results[seedFirst ? 0 : 1]?.status).toBe('fulfilled')
  const setting = await database.metadata.get(VISIBILITY_SETTING_ID)
  const catalog = await database.metadata.get('catalog-seeded')
  if (setting) {
    expect(results[seedFirst ? 1 : 0]?.status).toBe('fulfilled')
    expect(await getVisibility(database)).toEqual(visibility)
    expect(catalog).toBeUndefined()
  } else {
    expect(results[seedFirst ? 1 : 0]?.status).toBe('rejected')
    expect(catalog).toEqual({ id: 'catalog-seeded', value: 'done' })
    expect(await getVisibility(database)).toEqual(DEFAULT_VISIBILITY)
  }
  expect(await database.metadata.count()).toBe(4)
  expect(await database.metadata.get(DIARY_GENERATION_ID)).toEqual(generation)
  expect(await database.products.count()).toBe(2)
  const backup = await exportFullBackup(database)
  expect(backup.metadata).toHaveLength(3)
  expect(backup.metadata.some(row => row.id === DIARY_GENERATION_ID)).toBe(false)
  expect(readFullBackup(backup)).toEqual(backup)
})

it('конкурентные upsert новой видимости оба проходят и занимают один последний слот', async () => {
  const database = createDatabase()
  await database.metadata.bulkAdd([generation, ...metadata(2)])
  await Promise.all([saveVisibility(visibility, database), saveVisibility(DEFAULT_VISIBILITY, createDatabase(database.name))])
  expect(await database.metadata.count()).toBe(4)
  expect(await database.metadata.get(DIARY_GENERATION_ID)).toEqual(generation)
  expect([visibility, DEFAULT_VISIBILITY]).toContainEqual(await getVisibility(database))
})

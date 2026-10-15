import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { clearDiary, DIARY_GENERATION_ID } from './clearDiary'
import { addPhoto } from './photoRepository'
import { addDocument } from './documentRepository'
import { exportFullBackup, restoreFullBackup } from './fullBackupRepository'
import { restoreTextBackup } from './backupRepository'
import * as photoMedia from '../media/preparePhoto'
import * as documentMedia from '../media/prepareDocument'
import * as backupMedia from '../media/fullBackupFile'
import { encodeBase64 } from '../domain/base64'
import type { FullBackup } from '../domain/fullBackup'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 2, 0, 1, 1, 1, 17, 0, 255, 217])
const pdf = new Uint8Array(new TextEncoder().encode('%PDF-1.7\nSynthetic generation source\n%%EOF\n'))
const values = { date: '2026-10-14', title: 'Синтетический отложенный файл', note: '' }
const connections: DiaryDatabase[] = []
type PendingKind = 'photo' | 'document' | 'full'
type ReplacementKind = 'clear' | 'full' | 'text'

function deferred<T>() {
  let finish: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => { finish = resolve })
  return { promise, resolve(value: T) { if (!finish) throw new Error('Синтетическое ожидание не создано'); finish(value) } }
}
function createDatabase(name = `health-diary-test-generation-${crypto.randomUUID()}`) {
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
function fixture(variant: number): FullBackup {
  return {
    format: 'health-diary-full', version: 1,
    text: {
      format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
      profile: { id: 'self', name: `Синтетический профиль ${String(variant)}`, heightCm: 170, birthDate: null, formulaSex: 'none' },
      weights: [{ id: id(variant + 100), date: values.date, kg: 70 + variant }], products: [], foodEntries: [], nutritionDays: [],
      steps: [{ date: values.date, count: variant }], workouts: [], energyPlans: [],
    },
    metadata: [{ id: 'fixture', value: `Синтетическая настройка ${String(variant)}` }], photos: [], labResults: [],
    documents: [{ ...values, id: id(variant + 200), fileId: id(variant + 300), kind: 'other' }],
    files: [{ id: id(variant + 300), purpose: 'document', mime: 'application/pdf', size: pdf.length, base64: encodeBase64(pdf) }],
  }
}
async function generation(database: DiaryDatabase) {
  const marker = await database.metadata.get(DIARY_GENERATION_ID)
  expect(marker?.value).toMatch(uuid)
  expect(marker).toEqual({ id: DIARY_GENERATION_ID, value: marker?.value })
  if (!marker) throw new Error('Служебное поколение не записано')
  return marker.value
}
async function expectCleared(database: DiaryDatabase) {
  expect(await Promise.all(database.tables.filter(table => table.name !== 'metadata').map(table => table.count())))
    .toEqual(Array.from({ length: 12 }, () => 0))
  expect(await database.metadata.toArray()).toEqual([{ id: DIARY_GENERATION_ID, value: await generation(database) }])
}
async function paused(kind: PendingKind, database: DiaryDatabase) {
  const entered = deferred<undefined>()
  let release: () => void
  let task: Promise<unknown>
  if (kind === 'photo') {
    const result = { blob: new Blob([jpeg], { type: 'image/jpeg' }), width: 1, height: 2 }
    const gate = deferred<photoMedia.PreparedPhoto>()
    vi.mocked(photoMedia.preparePhoto).mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise })
    release = () => { gate.resolve(result) }
    task = addPhoto(values, result.blob, database)
  } else if (kind === 'document') {
    const result = await documentMedia.prepareDocument(new Blob([pdf], { type: 'application/pdf' }))
    const gate = deferred<Awaited<ReturnType<typeof documentMedia.prepareDocument>>>()
    vi.spyOn(documentMedia, 'prepareDocument').mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise })
    release = () => { gate.resolve(result) }
    task = addDocument({ ...values, kind: 'other' }, result.blob, database)
  } else {
    const input = fixture(3)
    const result = await backupMedia.prepareFullBackup(input)
    const gate = deferred<Awaited<ReturnType<typeof backupMedia.prepareFullBackup>>>()
    vi.spyOn(backupMedia, 'prepareFullBackup').mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise })
    release = () => { gate.resolve(result) }
    task = restoreFullBackup(input, database)
  }
  const outcome = task.then(() => null, (reason: unknown) => reason)
  await entered.promise
  return { release, outcome }
}
async function replace(kind: ReplacementKind, database: DiaryDatabase) {
  if (kind === 'clear') await clearDiary(database)
  else if (kind === 'full') await restoreFullBackup(fixture(2), database)
  else await restoreTextBackup(fixture(2).text, database)
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

it.each<PendingKind>(['photo', 'document', 'full'])('не возвращает отложенный %s после удаления через другую DB connection и допускает новый ввод', async kind => {
  const database = createDatabase()
  await restoreFullBackup(fixture(1), database)
  const pending = await paused(kind, database)
  const other = createDatabase(database.name)
  await clearDiary(other)
  await expectCleared(other)
  pending.release()
  expect(await pending.outcome).toBeInstanceOf(Error)
  await expectCleared(database)
  await addDocument({ ...values, kind: 'other' }, new Blob([pdf], { type: 'application/pdf' }), database)
  expect(await database.documents.count()).toBe(1)
  expect(await database.files.count()).toBe(1)
  database.close()
  const reopened = createDatabase(database.name)
  expect(await reopened.documents.count()).toBe(1)
  expect(await generation(reopened)).toBe(await generation(other))
})

it.each<PendingKind>(['photo', 'document', 'full'])('полное восстановление отменяет ранее подготовленный %s, сохраняя новую копию', async kind => {
  const database = createDatabase()
  await restoreFullBackup(fixture(1), database)
  const pending = await paused(kind, database)
  await restoreFullBackup(fixture(2), createDatabase(database.name))
  const marker = await generation(database)
  pending.release()
  expect(await pending.outcome).toBeInstanceOf(Error)
  expect(await exportFullBackup(database)).toEqual(fixture(2))
  expect(await generation(database)).toBe(marker)
})

it('текстовое восстановление отменяет старую полную подготовку и сохраняет прежние media', async () => {
  const database = createDatabase()
  await restoreFullBackup(fixture(1), database)
  const pending = await paused('full', database)
  await restoreTextBackup(fixture(2).text, createDatabase(database.name))
  const expected = { ...fixture(1), text: fixture(2).text }
  pending.release()
  expect(await pending.outcome).toBeInstanceOf(Error)
  expect(await exportFullBackup(database)).toEqual(expected)
})

it.each<ReplacementKind>(['clear', 'full', 'text'])('отказ смены поколения в %s откатывает данные и не отменяет ещё допустимую подготовку', async kind => {
  const database = createDatabase()
  await restoreFullBackup(fixture(1), database)
  const marker = await generation(database)
  const pending = await paused('photo', database)
  const fail = vi.spyOn(database.metadata, 'put').mockRejectedValueOnce(new DOMException('Синтетический отказ поколения', 'QuotaExceededError'))
  await expect(replace(kind, database)).rejects.toMatchObject({ name: 'QuotaExceededError' })
  fail.mockRestore()
  expect(await generation(database)).toBe(marker)
  expect(await exportFullBackup(database)).toEqual(fixture(1))
  pending.release()
  expect(await pending.outcome).toBeNull()
  expect(await database.photos.count()).toBe(1)
  expect(await database.documents.toArray()).toEqual(fixture(1).documents)
})

it('не переносит поколение в копию и заменяет подделанный marker свежим UUID при восстановлении старого формата', async () => {
  const database = createDatabase()
  expect(await database.metadata.get(DIARY_GENERATION_ID)).toBeUndefined()
  await restoreFullBackup(fixture(1), database)
  const previous = await generation(database)
  expect(await exportFullBackup(database)).toEqual(fixture(1))
  for (const forged of [previous, 'synthetic-not-a-generation']) {
    await restoreFullBackup({ ...fixture(2), metadata: [...fixture(2).metadata, { id: DIARY_GENERATION_ID, value: forged }] }, database)
    const fresh = await generation(database)
    expect(fresh).not.toBe(forged)
    expect(fresh).not.toBe(previous)
    expect(await exportFullBackup(database)).toEqual(fixture(2))
    expect(await database.metadata.toArray()).toEqual(expect.arrayContaining([...fixture(2).metadata, { id: DIARY_GENERATION_ID, value: fresh }]))
    expect(await database.metadata.count()).toBe(2)
  }
  const beforeClear = await generation(database)
  await clearDiary(database)
  const afterClear = await generation(database)
  await clearDiary(database)
  expect(new Set([beforeClear, afterClear, await generation(database)]).size).toBe(3)
  await expectCleared(database)
})

import Dexie from 'dexie'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DiaryDatabase } from './db'
import { clearDiary, DIARY_GENERATION_ID } from './clearDiary'
import { addPhoto } from './photoRepository'
import { addDocument } from './documentRepository'
import { exportFullBackup, restoreFullBackup } from './fullBackupRepository'
import { restoreTextBackup } from './backupRepository'
import { encodeBase64 } from '../domain/base64'
import { expectDiaryMetadata, expectDiaryUserDataEmpty } from '../../tests/generationAssertions'
import type { FullBackup } from '../domain/fullBackup'

const values = { date: '2026-10-14', title: 'Синтетический браузерный файл', note: '' }
const connections: DiaryDatabase[] = []
const pendingKinds = ['photo', 'document', 'full'] as const
const replacements = ['clear', 'full', 'text'] as const
const cases = pendingKinds.flatMap(kind => replacements.map(replacement => ({ kind, replacement })))
function deferred() {
  let finish: (() => void) | undefined
  const promise = new Promise<void>(resolve => { finish = resolve })
  return { promise, resolve() { if (!finish) throw new Error('Синтетическое ожидание не создано'); finish() } }
}
function createDatabase(name = `health-diary-test-generation-browser-${crypto.randomUUID()}`) {
  expect(import.meta.env.MODE).toBe('test')
  expect(name.startsWith('health-diary-test-generation-browser-')).toBe(true)
  const database = new DiaryDatabase(name)
  connections.push(database)
  return database
}
function fixture(): FullBackup {
  const pdf = new Uint8Array(new TextEncoder().encode('%PDF-1.7\nSynthetic browser generation\n%%EOF\n'))
  return {
    format: 'health-diary-full', version: 1,
    text: {
      format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
      profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [],
      steps: [{ date: values.date, count: 1234 }], workouts: [], energyPlans: [],
    },
    metadata: [{ id: 'fixture', value: 'Синтетическая новая настройка' }], photos: [], labResults: [],
    documents: [{ ...values, id: '00000000-0000-4000-8000-000000000201', fileId: '00000000-0000-4000-8000-000000000301', kind: 'other' }],
    files: [{ id: '00000000-0000-4000-8000-000000000301', purpose: 'document', mime: 'application/pdf', size: pdf.length, base64: encodeBase64(pdf) }],
  }
}
async function image() {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 4
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Для синтетического изображения нужен Canvas')
  context.fillStyle = '#008080'
  context.fillRect(0, 0, 8, 4)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетическое изображение не создано')) }, 'image/png')
  })
}
function pauseFileRead() {
  const entered = deferred()
  const released = deferred()
  const blobPrototype: { arrayBuffer: (this: Blob) => Promise<ArrayBuffer> } = Blob.prototype
  const original = blobPrototype.arrayBuffer
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementationOnce(function (this: Blob) {
    entered.resolve()
    return released.promise.then(() => original.call(this))
  })
  return { entered: entered.promise, release: () => { released.resolve() } }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of connections) database.close()
  await Promise.all([...new Set(connections.map(database => database.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})

test.each(cases)('настоящий IndexedDB: отложенный $kind не перезаписывает $replacement через второе соединение', async ({ kind, replacement }) => {
  const database = createDatabase()
  await database.steps.add({ date: values.date, count: 0 })
  const source = await image()
  const gate = pauseFileRead()
  const task = kind === 'photo' ? addPhoto(values, source, database)
    : kind === 'document' ? addDocument({ ...values, kind: 'other' }, source, database)
      : restoreFullBackup(fixture(), database)
  const outcome = task.then(() => null, (reason: unknown) => reason)
  await gate.entered
  const other = createDatabase(database.name)
  if (replacement === 'clear') await clearDiary(other)
  else if (replacement === 'full') await restoreFullBackup(fixture(), other)
  else await restoreTextBackup(fixture().text, other)
  const expected = await exportFullBackup(other)
  const marker = await other.metadata.get(DIARY_GENERATION_ID)
  gate.release()
  expect(await outcome).toBeInstanceOf(Error)
  expect(await exportFullBackup(database)).toEqual(expected)
  expect(await database.metadata.get(DIARY_GENERATION_ID)).toEqual(marker)
  if (replacement === 'clear') await expectDiaryUserDataEmpty(database)
  else await expectDiaryMetadata(database, replacement === 'full' ? fixture().metadata : [])
  database.close()
  const reopened = createDatabase(database.name)
  expect(await exportFullBackup(reopened)).toEqual(expected)
  await addDocument({ ...values, kind: 'other' }, new Blob(['%PDF-1.7\nSynthetic retry\n%%EOF\n'], { type: 'application/pdf' }), reopened)
  expect(await reopened.documents.count()).toBe(expected.documents.length + 1)
  expect(await reopened.files.count()).toBe(expected.files.length + 1)
})

test('отказ служебной записи откатывает настоящее удаление и допускает подготовленное фото старой базы без marker', async () => {
  const database = createDatabase()
  await database.steps.add({ date: values.date, count: 0 })
  const source = await image()
  const gate = pauseFileRead()
  const task = addPhoto(values, source, database)
  const outcome = task.then(value => value, (reason: unknown) => reason)
  await gate.entered
  const fail = vi.spyOn(database.metadata, 'put').mockRejectedValueOnce(new DOMException('Synthetic marker quota', 'QuotaExceededError'))
  await expect(clearDiary(database)).rejects.toMatchObject({ name: 'QuotaExceededError' })
  fail.mockRestore()
  expect(await database.metadata.toArray()).toEqual([])
  expect(await database.steps.toArray()).toEqual([{ date: values.date, count: 0 }])
  gate.release()
  expect(await outcome).toMatchObject({ ...values, width: 8, height: 4 })
  expect(await database.photos.count()).toBe(1)
  expect(await database.files.count()).toBe(1)
})

import { Blob as NativeBlob } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, DiaryDatabase } from './db'
import { addPhoto, deletePhoto, listPhotos, updatePhoto } from './photoRepository'
import { preparePhoto } from '../media/preparePhoto'
import { prepareFile } from './fileRepository'
import { DOCUMENT_MAX_BYTES } from '../domain/attachment'

vi.mock('../media/preparePhoto', () => ({ preparePhoto: vi.fn() }))

const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 1, 2, 255, 217])
const values = { date: '2026-10-14', title: '  Синтетический снимок  ', note: '  Синтетическая заметка  ' }
const connections: DiaryDatabase[] = []
let sequence = 0
function createDatabase() {
  const database = new DiaryDatabase(`health-diary-test-photos-${String(++sequence)}`)
  connections.push(database)
  return database
}
function prepared() { return { blob: new Blob([jpeg], { type: 'image/jpeg' }), width: 320, height: 240 } }

beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
  vi.mocked(preparePhoto).mockReset().mockResolvedValue(prepared())
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const connection of connections) connection.close()
  await Promise.all([...new Set(connections.map(connection => connection.name))].map(name => Dexie.delete(name)))
  connections.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('проверяет дату и подпись до подготовки или открытия транзакции', async () => {
  const database = createDatabase()
  const transaction = vi.spyOn(database, 'transaction')
  for (const input of [null, { ...values, date: '2026-10-15' }, { ...values, date: '2026-02-30' }, { ...values, title: ' ' }, { ...values, extra: true }]) {
    await expect(addPhoto(input, new NativeBlob([]), database)).rejects.toThrow()
  }
  expect(preparePhoto).not.toHaveBeenCalled()
  expect(transaction).not.toHaveBeenCalled()
  expect(await database.photos.count()).toBe(0)
  expect(await database.files.count()).toBe(0)
})

it('проверяет подготовленные размеры и ошибки декодирования до записи файла', async () => {
  const database = createDatabase()
  const transaction = vi.spyOn(database, 'transaction')
  for (const size of [{ width: 0, height: 240 }, { width: 2049, height: 240 }, { width: 320, height: 1.5 }]) {
    vi.mocked(preparePhoto).mockResolvedValueOnce({ ...prepared(), ...size })
    await expect(addPhoto(values, new NativeBlob([]), database)).rejects.toThrow()
  }
  vi.mocked(preparePhoto).mockRejectedValueOnce(new Error('Синтетический отказ декодирования'))
  await expect(addPhoto(values, new NativeBlob([]), database)).rejects.toThrow('Синтетический отказ декодирования')
  expect(transaction).not.toHaveBeenCalled()
  expect(await database.photos.count()).toBe(0)
  expect(await database.files.count()).toBe(0)
})

it('готовит фото до RW, сохраняет обе записи и сортирует историю после reopen по дате и ID', async () => {
  const database = createDatabase()
  const transaction = vi.spyOn(database, 'transaction')
  const source = new NativeBlob([jpeg], { type: 'image/jpeg' })
  vi.mocked(preparePhoto).mockImplementationOnce(input => {
    expect(input).toBe(source)
    expect(transaction).not.toHaveBeenCalled()
    expect(Dexie.currentTransaction).toBeNull()
    return Promise.resolve(prepared())
  })
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000101').mockReturnValueOnce('00000000-0000-4000-8000-000000000303')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000102').mockReturnValueOnce('00000000-0000-4000-8000-000000000301')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000103').mockReturnValueOnce('00000000-0000-4000-8000-000000000302')
  const old = await addPhoto({ ...values, date: '2026-10-12' }, source, database)
  const first = await addPhoto(values, source, database)
  const second = await addPhoto(values, source, database)
  expect(first).toMatchObject({ title: 'Синтетический снимок', note: 'Синтетическая заметка', width: 320, height: 240 })
  expect(await database.files.count()).toBe(3)
  database.close()
  const reopened = new DiaryDatabase(database.name)
  connections.push(reopened)
  expect(await listPhotos(reopened)).toEqual([first, second, old])
  const file = await reopened.files.get(first.fileId)
  expect(file).toMatchObject({ purpose: 'photo', mime: 'image/jpeg', size: jpeg.length })
  if (!file) throw new Error('Подготовленный синтетический файл отсутствует')
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(jpeg))
})

it('откатывает уже добавленный файл при позднем отказе создания карточки фото', async () => {
  const database = createDatabase()
  const before = await addPhoto({ ...values, date: '2026-10-13' }, new NativeBlob([jpeg]), database)
  function fail() {
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический отказ карточки фото')
  }
  database.photos.hook('creating', fail)
  await expect(addPhoto(values, new NativeBlob([jpeg]), database)).rejects.toThrow('Синтетический отказ карточки фото')
  database.photos.hook('creating').unsubscribe(fail)
  expect(await listPhotos(database)).toEqual([before])
  expect(await database.files.count()).toBe(1)
  expect((await database.files.toArray())[0]?.id).toBe(before.fileId)
})

it('общий предел файлов отвергает новое фото без отдельной карточки или файла', async () => {
  const database = createDatabase()
  const header = new TextEncoder().encode('%PDF-2.0\n')
  const end = new TextEncoder().encode('\n%%EOF\n')
  const large = await prepareFile(new NativeBlob([header, new Uint8Array(DOCUMENT_MAX_BYTES - header.length - end.length), end], { type: 'application/pdf' }), 'document')
  await database.files.bulkAdd(Array.from({ length: 5 }, (_, index) => ({ ...large, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` })))
  await expect(addPhoto(values, new NativeBlob([jpeg]), database)).rejects.toThrow('Вложения превышают общий предел 100 MiB')
  expect(await database.photos.count()).toBe(0)
  expect(await database.files.count()).toBe(5)
})

it('уникальный fileId не позволяет двум карточкам ссылаться на один файл', async () => {
  const database = createDatabase()
  const photo = await addPhoto(values, new NativeBlob([jpeg]), database)
  await expect(database.photos.add({ ...photo, id: '00000000-0000-4000-8000-000000000999' })).rejects.toMatchObject({ name: 'ConstraintError' })
  expect(await listPhotos(database)).toEqual([photo])
  expect(await database.files.count()).toBe(1)
})

it('повторно валидирует сохранённые карточки, включая будущую дату и размеры', async () => {
  const database = createDatabase()
  const photo = await addPhoto(values, new NativeBlob([jpeg]), database)
  for (const corrupted of [{ ...photo, date: '2026-10-15' }, { ...photo, width: 2049 }, { ...photo, fileId: 'unknown' }, { ...photo, extra: true }]) {
    await database.table<unknown, string>('photos').put(corrupted)
    await expect(listPhotos(database)).rejects.toThrow()
  }
  await database.photos.put(photo)
  expect(await listPhotos(database)).toEqual([photo])
})

it('добавляет и читает фото только через default singleton тестового режима', async () => {
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  const photo = await addPhoto(values, new NativeBlob([jpeg]))
  expect(await listPhotos()).toEqual([photo])
  expect(await db.files.count()).toBe(1)
})

it('правит только метаданные фото, сохраняя fileId, размеры, байты и соседнюю карточку', async () => {
  const database = createDatabase()
  const neighbor = await addPhoto({ ...values, date: '2026-10-13', title: 'Соседний синтетический снимок' }, new NativeBlob([jpeg]), database)
  const photo = await addPhoto({ ...values, date: '2026-10-12' }, new NativeBlob([jpeg]), database)
  const changed = { date: '2026-10-14', title: 'Исправленный синтетический снимок', note: '' }
  await updatePhoto(photo.id, { ...changed, title: `  ${changed.title}  ` }, database)
  expect(await listPhotos(database)).toEqual([{ ...photo, ...changed }, neighbor])
  expect(preparePhoto).toHaveBeenCalledTimes(2)
  expect(await database.files.count()).toBe(2)
  const file = await database.files.get(photo.fileId)
  if (!file) throw new Error('Синтетический файл утрачен при правке')
  expect(file).toMatchObject({ id: photo.fileId, purpose: 'photo', mime: 'image/jpeg', size: jpeg.length })
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(jpeg))
})

it('отвергает неверный ID, будущую дату и чужие поля до транзакции, а отсутствующую карточку — без изменений', async () => {
  const database = createDatabase()
  const photo = await addPhoto(values, new NativeBlob([jpeg]), database)
  const transaction = vi.spyOn(database, 'transaction')
  for (const invalid of [null, 'unknown', 1, {}]) {
    await expect(updatePhoto(invalid, values, database)).rejects.toThrow()
    await expect(deletePhoto(invalid, database)).rejects.toThrow()
  }
  for (const input of [{ ...values, date: '2026-10-15' }, { ...values, fileId: photo.fileId }, { ...values, width: 100 }]) {
    await expect(updatePhoto(photo.id, input, database)).rejects.toThrow()
  }
  expect(transaction).not.toHaveBeenCalled()
  transaction.mockRestore()
  const missing = '00000000-0000-4000-8000-000000000999'
  await expect(updatePhoto(missing, values, database)).rejects.toThrow('Фотография не найдена')
  await expect(deletePhoto(missing, database)).rejects.toThrow('Фотография не найдена')
  expect(await listPhotos(database)).toEqual([photo])
  expect(await database.files.count()).toBe(1)
})

it('удаляет только выбранное фото с его файлом и допускает очистку карточки с отсутствующим файлом', async () => {
  const database = createDatabase()
  const selected = await addPhoto(values, new NativeBlob([jpeg]), database)
  const neighbor = await addPhoto({ ...values, date: '2026-10-13' }, new NativeBlob([jpeg]), database)
  const unrelated = await prepareFile(new NativeBlob(['%PDF-1.7\nSynthetic\n%%EOF\n'], { type: 'application/pdf' }), 'document')
  await database.files.add(unrelated)
  await deletePhoto(selected.id, database)
  expect(await listPhotos(database)).toEqual([neighbor])
  expect(await database.files.get(selected.fileId)).toBeUndefined()
  expect((await database.files.toArray()).map(file => file.id).sort()).toEqual([neighbor.fileId, unrelated.id].sort())
  await database.files.delete(neighbor.fileId)
  await deletePhoto(neighbor.id, database)
  expect(await listPhotos(database)).toEqual([])
  expect((await database.files.toArray()).map(file => file.id)).toEqual([unrelated.id])
})

it('откатывает удаление карточки и файла при позднем отказе files deleting-hook', async () => {
  const database = createDatabase()
  const photo = await addPhoto(values, new NativeBlob([jpeg]), database)
  let photoDeleteStarted = false
  function observePhotoDelete() { photoDeleteStarted = true }
  function failFileDelete() {
    expect(photoDeleteStarted).toBe(true)
    expect(Dexie.currentTransaction.mode).toBe('readwrite')
    throw new Error('Синтетический поздний отказ удаления файла')
  }
  database.photos.hook('deleting', observePhotoDelete)
  database.files.hook('deleting', failFileDelete)
  await expect(deletePhoto(photo.id, database)).rejects.toThrow('Синтетический поздний отказ удаления файла')
  database.photos.hook('deleting').unsubscribe(observePhotoDelete)
  database.files.hook('deleting').unsubscribe(failFileDelete)
  expect(await listPhotos(database)).toEqual([photo])
  expect(await database.files.count()).toBe(1)
  const file = await database.files.get(photo.fileId)
  if (!file) throw new Error('Синтетический файл не восстановлен при откате')
  expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(Array.from(jpeg))
})

it('не правит и не удаляет повреждённую карточку, сохраняя исходный файл', async () => {
  const database = createDatabase()
  const photo = await addPhoto(values, new NativeBlob([jpeg]), database)
  const corrupted = { ...photo, height: 0 }
  await database.table<unknown, string>('photos').put(corrupted)
  await expect(updatePhoto(photo.id, values, database)).rejects.toThrow()
  await expect(deletePhoto(photo.id, database)).rejects.toThrow()
  expect(await database.table<unknown, string>('photos').get(photo.id)).toEqual(corrupted)
  expect(await database.files.count()).toBe(1)
})

it('правит и удаляет фото через default singleton после его повторного открытия', async () => {
  expect(db.name).toBe('health-diary-tests')
  connections.push(db)
  await db.open()
  const photo = await addPhoto(values, new NativeBlob([jpeg]))
  await updatePhoto(photo.id, { ...values, title: 'Изменённый синтетический снимок', note: '' })
  expect((await listPhotos())[0]).toEqual({ ...photo, title: 'Изменённый синтетический снимок', note: '' })
  await deletePhoto(photo.id)
  expect(await listPhotos()).toEqual([])
  expect(await db.files.count()).toBe(0)
})

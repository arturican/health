import { Blob as NativeBlob, File as NativeFile } from 'node:buffer'
import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareFullBackup, readFullBackupFile } from './fullBackupFile'
import { encodeBase64 } from '../domain/base64'
import { FULL_BACKUP_MAX_BYTES, type BackupFile, type FullBackup } from '../domain/fullBackup'
import { DOCUMENT_MAX_BYTES } from '../domain/attachment'

const photoId = '00000000-0000-4000-8000-000000000001'
const photoFileId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000002'
const documentFileId = '00000000-0000-4000-8000-000000000102'
const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 2, 0, 1, 1, 1, 17, 0, 255, 217])
const exifJpeg = new Uint8Array([...jpeg.slice(0, 2), 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, ...jpeg.slice(2)])
const pdf = new Uint8Array(new TextEncoder().encode('%PDF-1.7\nSynthetic source\n%%EOF\n'))
const photoFile: BackupFile = { id: photoFileId, purpose: 'photo', mime: 'image/jpeg', size: jpeg.length, base64: encodeBase64(jpeg) }
const documentFile: BackupFile = { id: documentFileId, purpose: 'document', mime: 'application/pdf', size: pdf.length, base64: encodeBase64(pdf) }
const empty: FullBackup = {
  format: 'health-diary-full', version: 1,
  text: { format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z', profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] },
  metadata: [], photos: [], documents: [], labResults: [], files: [],
}
const complete: FullBackup = {
  ...empty, metadata: [{ id: 'catalog-seeded', value: 'done' }],
  photos: [{ id: photoId, fileId: photoFileId, date: '2026-10-12', title: 'Синтетический кадр 🧪', note: '', width: 1, height: 2 }],
  documents: [{ id: documentId, fileId: documentFileId, date: '2026-10-14', title: 'Синтетический бланк', kind: 'lab', note: '' }],
  labResults: [{ id: '00000000-0000-4000-8000-000000000003', documentId, date: '2026-10-14', name: 'Синтетический показатель', value: { type: 'number', number: 0, operator: 'eq' }, unit: '', reference: '', note: '' }],
  files: [photoFile, documentFile],
}
function encoded(file: BackupFile, bytes: Uint8Array): BackupFile { return { ...file, size: bytes.length, base64: encodeBase64(bytes) } }
const close = vi.fn<() => void>()
const decode = vi.fn<typeof createImageBitmap>()

beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob)
  vi.stubGlobal('File', NativeFile)
  close.mockReset()
  decode.mockReset().mockImplementation(() => {
    expect(Dexie.currentTransaction).toBeNull()
    return Promise.resolve({ width: 1, height: 2, close })
  })
  vi.stubGlobal('createImageBitmap', decode)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('готовит и читает полную копию с исходными PDF/JPEG-байтами, Unicode и освобождённым bitmap без DB', async () => {
  const open = vi.spyOn(indexedDB, 'open')
  const original = structuredClone(complete)
  const prepared = await prepareFullBackup(complete)
  expect(prepared.backup).toEqual(complete)
  expect(prepared.backup).not.toBe(complete)
  expect(prepared.files).toHaveLength(2)
  const photo = prepared.files[0]
  const document = prepared.files[1]
  if (!photo || !document) throw new Error('Синтетические подготовленные файлы отсутствуют')
  expect(photo).toMatchObject({ id: photoFileId, purpose: 'photo', mime: 'image/jpeg', size: jpeg.length })
  expect(document).toMatchObject({ id: documentFileId, purpose: 'document', mime: 'application/pdf', size: pdf.length })
  expect(Array.from(new Uint8Array(await photo.blob.arrayBuffer()))).toEqual(Array.from(jpeg))
  expect(Array.from(new Uint8Array(await document.blob.arrayBuffer()))).toEqual(Array.from(pdf))
  const input = new NativeFile([JSON.stringify(complete)], 'synthetic.json', { type: 'application/json' })
  expect(await readFullBackupFile(input)).toEqual(complete)
  expect(complete).toEqual(original)
  expect(close).toHaveBeenCalledTimes(2)
  expect(open).not.toHaveBeenCalled()
})

it('принимает пустую копию и отклоняет неверные формат, связи, Base64 и размеры до декодера/DB', async () => {
  const open = vi.spyOn(indexedDB, 'open')
  expect(await prepareFullBackup(empty)).toEqual({ backup: empty, files: [] })
  for (const input of [
    null, { ...complete, version: 2 }, { ...complete, files: [photoFile] },
    { ...complete, files: [...complete.files, { ...documentFile, id: '00000000-0000-4000-8000-000000000999' }] },
    { ...complete, files: [{ ...photoFile, base64: 'invalid' }, documentFile] },
    { ...complete, files: [photoFile, { ...documentFile, size: DOCUMENT_MAX_BYTES + 1 }] },
    { ...complete, labResults: complete.labResults.map(result => ({ ...result, documentId: photoId })) },
  ]) await expect(prepareFullBackup(input)).rejects.toThrow()
  expect(decode).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
})

it('отвергает подмену MIME, обрезанные/неверные заголовки, несовпадающие размеры и EXIF до preview', async () => {
  for (const input of [
    { ...complete, files: [encoded(photoFile, pdf), documentFile] },
    { ...complete, files: [encoded(photoFile, jpeg.slice(0, -1)), documentFile] },
    { ...complete, files: [encoded(photoFile, new Uint8Array([255, 216, 255, 224, 0, 2, 255, 217])), documentFile] },
    { ...complete, photos: complete.photos.map(photo => ({ ...photo, width: 2 })) },
    { ...complete, files: [encoded(photoFile, exifJpeg), documentFile] },
  ]) await expect(prepareFullBackup(input)).rejects.toThrow()
  expect(decode).not.toHaveBeenCalled()
})

it('отказ декодера и неверные действительные размеры отклоняют копию, bitmap всегда закрывается', async () => {
  decode.mockRejectedValueOnce(new Error('Синтетические закрытые детали декодера'))
  await expect(prepareFullBackup(complete)).rejects.toMatchObject({ message: 'Не удалось декодировать изображение копии' })
  expect(close).not.toHaveBeenCalled()
  for (const size of [{ width: 0, height: 2 }, { width: 1, height: 3 }]) {
    decode.mockResolvedValueOnce({ ...size, close })
    await expect(prepareFullBackup(complete)).rejects.toThrow()
  }
  expect(close).toHaveBeenCalledTimes(2)
})

it('сохраняет оригинальный JPEG документа с EXIF, запрещая EXIF только в подготовленном фото', async () => {
  const input = { ...complete, files: [photoFile, encoded({ ...documentFile, mime: 'image/jpeg' }, exifJpeg)] }
  const prepared = await prepareFullBackup(input)
  const document = prepared.files.find(file => file.id === documentFileId)
  if (!document) throw new Error('Синтетический оригинал документа отсутствует')
  expect(Array.from(new Uint8Array(await document.blob.arrayBuffer()))).toEqual(Array.from(exifJpeg))
  expect(close).toHaveBeenCalledTimes(2)
})

it('проверяет File и размер до чтения, разрешая чтение на точной границе 200 MiB без выделения большого JSON', async () => {
  for (const input of [null, {}, new NativeBlob(['{}']), new Uint8Array([1])]) await expect(readFullBackupFile(input)).rejects.toThrow('Выберите файл полной копии')
  for (const size of [0, FULL_BACKUP_MAX_BYTES + 1]) {
    const input = new NativeFile(['x'], 'synthetic.json')
    Object.defineProperty(input, 'size', { value: size })
    const read = vi.spyOn(input, 'arrayBuffer')
    await expect(readFullBackupFile(input)).rejects.toThrow(size === 0 ? 'Файл пуст' : 'Полная копия превышает 200 MiB')
    expect(read).not.toHaveBeenCalled()
  }
  const exact = new NativeFile(['x'], 'synthetic.json')
  Object.defineProperty(exact, 'size', { value: FULL_BACKUP_MAX_BYTES })
  const read = vi.spyOn(exact, 'arrayBuffer').mockRejectedValueOnce(new Error('Синтетический отказ чтения'))
  await expect(readFullBackupFile(exact)).rejects.toMatchObject({ message: 'Не удалось прочитать JSON в кодировке UTF-8' })
  expect(read).toHaveBeenCalledTimes(1)
})

it('скрывает исходное содержимое испорченного JSON/UTF-8 и обнаруживает изменившийся размер чтения', async () => {
  for (const bytes of [new Uint8Array([255, 254]), new Uint8Array(new TextEncoder().encode('Синтетическая закрытая строка'))]) {
    const input = new NativeFile([bytes], 'synthetic.json')
    await expect(readFullBackupFile(input)).rejects.toMatchObject({ message: 'Не удалось прочитать JSON в кодировке UTF-8' })
  }
  const changed = new NativeFile(['{}'], 'synthetic.json')
  vi.spyOn(changed, 'arrayBuffer').mockResolvedValueOnce(new ArrayBuffer(changed.size + 1))
  await expect(readFullBackupFile(changed)).rejects.toMatchObject({ message: 'Не удалось прочитать JSON в кодировке UTF-8' })
})

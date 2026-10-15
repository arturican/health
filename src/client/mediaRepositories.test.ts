// @vitest-environment node
import sharp from 'sharp'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clientApi } from '../../tests/clientApi'
import { registerFiles } from '../server/fileRecords'
import { registerPhotos } from '../server/photoRoutes'
import { registerDocuments } from '../server/documentRoutes'
import { registerLabs } from '../server/labRoutes'
import { createUploadTransport } from '../server/uploadTransport'
import * as photoPreparation from '../media/preparePhoto'
import { addPhoto, deletePhoto, listPhotos, updatePhoto } from './photoRepository'
import { addDocument, countDocumentResults, deleteDocument, deleteDocumentWithResults, listDocuments, updateDocument } from './documentRepository'
import { addLabResult, deleteLabResult, listLabResults, updateLabResult } from './labRepository'
import { listLabHistory } from './labHistoryRepository'
import { getFile } from './fileRepository'

let api: Awaited<ReturnType<typeof clientApi>>
const day = '2026-10-15', pdf = () => new Blob(['%PDF-1.7\n% Synthetic original\n%%EOF\n'], { type: 'application/pdf' })
const documentInput = { date: day, title: 'Учебный документ', kind: 'lab', note: '' }
beforeEach(async () => {
  api = await clientApi((app, pool, authorize, clock) => {
    const uploads = createUploadTransport(app, authorize)
    registerFiles(app, pool, authorize); registerPhotos(app, pool, authorize, uploads, clock)
    registerDocuments(app, pool, authorize, uploads, clock); registerLabs(app, pool, authorize, clock)
  })
})
afterEach(async () => { vi.restoreAllMocks(); await api.close() })

it('повтор загрузки PDF сохраняет одну запись и точные байты; правка и удаление используют версии', async () => {
  const transport = api.network.getMockImplementation()
  if (!transport) throw new Error('Нет транспорта')
  api.network.mockImplementationOnce(async (...args) => { await transport(...args); throw new Error('Ответ потерян') })
  await expect(addDocument(documentInput, pdf())).rejects.toThrow()
  const document = await addDocument(documentInput, pdf())
  expect(await listDocuments()).toHaveLength(1)
  expect(await (await getFile(document.fileId))?.blob.text()).toBe(await pdf().text())
  expect(await countDocumentResults(document)).toBe(0)
  await updateDocument(document, { ...documentInput, title: 'Новая подпись' })
  await expect(deleteDocument(document)).rejects.toMatchObject({ status: 409 })
  const latest = (await listDocuments())[0]
  if (!latest) throw new Error('Нет документа')
  await deleteDocument(latest)
  expect(await getFile(document.fileId)).toBeNull()
})

it('показатели меняют версию документа и защищают подтверждение каскадного удаления', async () => {
  const document = await addDocument(documentInput, pdf())
  const input = { documentId: document.id, date: day, name: 'Учебный показатель', value: { type: 'number', number: 5.123456789, operator: 'eq' }, unit: 'ммоль/л', reference: '', note: '' }
  const result = await addLabResult(input)
  await expect(countDocumentResults(document)).rejects.toMatchObject({ status: 409 })
  await updateLabResult(result, { ...input, value: { type: 'text', text: 'Учебный текст' }, unit: '' })
  await expect(deleteLabResult(result)).rejects.toMatchObject({ status: 409 })
  const latest = (await listLabResults(document.id))[0]
  if (!latest) throw new Error('Нет показателя')
  expect(latest.value).toEqual({ type: 'text', text: 'Учебный текст' })
  await deleteLabResult(latest)
  await addLabResult(input)
  const before = (await listDocuments())[0]
  if (!before) throw new Error('Нет документа')
  const count = await countDocumentResults(before)
  expect(count).toBe(1)
  await addLabResult({ ...input, name: 'Другой показатель' })
  await expect(deleteDocumentWithResults(before, count)).rejects.toMatchObject({ status: 409 })
  const history = await listLabHistory()
  expect(history.documents).toHaveLength(1)
  expect(history.series).toHaveLength(2)
  const current = history.documents[0]
  if (!current) throw new Error('Нет документа истории')
  await deleteDocumentWithResults(current, await countDocumentResults(current))
  expect(await listLabResults()).toEqual([])
  expect(await getFile(document.fileId)).toBeNull()
})

it('фото проходит JPEG, сохраняет файл при правке и недоступно другому аккаунту', async () => {
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#246890' } }).jpeg().toBuffer()
  const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' })
  vi.spyOn(photoPreparation, 'preparePhoto').mockResolvedValue({ blob, width: 8, height: 6 })
  const input = { date: day, title: 'Синтетическая геометрия', note: '' }
  const original = await addPhoto(input, blob)
  expect(original).toMatchObject({ width: 8, height: 6 })
  await updatePhoto(original, { ...input, note: 'Правка' })
  const current = (await listPhotos())[0]
  if (!current) throw new Error('Нет фото')
  const file = await getFile(current.fileId)
  if (!file) throw new Error('Нет файла')
  expect(Buffer.from(await file.blob.arrayBuffer())).toEqual(bytes)
  await api.signIn('bob')
  expect(await listPhotos()).toEqual([])
  expect(await getFile(current.fileId)).toBeNull()
  await api.signIn()
  const own = (await listPhotos())[0]
  if (!own) throw new Error('Нет своего фото')
  await deletePhoto(own)
  expect(await getFile(own.fileId)).toBeNull()
})

it('поздняя подготовка фото после смены аккаунта не отправляет загрузку', async () => {
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#246890' } }).jpeg().toBuffer()
  const prepared = { blob: new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' }), width: 8, height: 6 }
  let release: (value: typeof prepared) => void = () => { throw new Error('Нет ожидания') }
  vi.spyOn(photoPreparation, 'preparePhoto').mockReturnValue(new Promise(resolve => { release = resolve }))
  const pending = expect(addPhoto({ date: day, title: 'Учебное фото', note: '' }, prepared.blob)).rejects.toMatchObject({ status: 409 })
  await api.signIn('bob')
  release(prepared)
  await pending
  expect(api.network).not.toHaveBeenCalled()
  expect((await api.database.pool.query('SELECT count(*)::text AS count FROM health.files')).rows).toEqual([{ count: '0' }])
})

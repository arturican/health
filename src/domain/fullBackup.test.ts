import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readFullBackup, serializeFullBackup, type BackupFile, type FullBackup } from './fullBackup'
import { encodeBase64 } from './base64'
import { DOCUMENT_MAX_BYTES, PHOTO_MAX_BYTES } from './attachment'
import type { TextBackup } from './backup'
import type { Photo } from './photo'
import type { DiaryDocument } from './document'
import type { LabResult } from './labResult'
import { VISIBILITY_SETTING_ID } from './visibility'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const text: TextBackup = {
  format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z',
  profile: { id: 'self', name: 'Синтетический профиль 🧪', heightCm: 170, birthDate: null, formulaSex: 'none' },
  weights: [{ id: id(101), date: '2026-10-12', kg: 70 }],
  products: [{ id: id(201), name: 'Синтетический продукт', source: 'Этикетка', kcal: 0, protein: 0, fat: null, carbs: 0, archived: false }],
  foodEntries: [{ id: id(301), productId: id(201), date: '2026-10-14', meal: 'lunch', grams: 100, note: '', snapshot: { name: 'Синтетический продукт', source: 'Прежняя этикетка', kcal: 0, protein: 0, fat: null, carbs: 0 } }],
  nutritionDays: [{ date: '2026-10-14', complete: false }], steps: [{ date: '2026-10-14', count: 0 }],
  workouts: [{ id: id(401), date: '2026-10-14', kind: 'Синтетическая прогулка', minutes: 10, kcal: null, source: '', note: '' }],
  energyPlans: [{ id: id(402), revision: 1, createdOn: '2026-10-14', effectiveFrom: '2026-10-15', goalKcal: 0, method: 'manual', manualKcal: 0, factor: null, source: '', restingFormula: 'mifflin-st-jeor-1990', snapshot: { kg: 70, weightDate: '2026-10-12', heightCm: 170, age: null, formulaSex: 'none' } }],
}
const photo: Photo = { id: id(501), fileId: id(701), date: '2026-10-12', title: 'Синтетическое фото', note: 'Только сравнение по датам', width: 320, height: 240 }
const document: DiaryDocument = { id: id(601), fileId: id(702), date: '2026-10-14', title: 'Синтетический бланк', kind: 'lab', note: '' }
const result: LabResult = { id: id(801), documentId: document.id, date: '2026-10-14', name: 'Синтетический показатель', value: { type: 'number', number: -0.25, operator: 'lte' }, unit: 'синт. ед.', reference: 'Как на бланке', note: '' }
// T055 validates the container model; pixel/header decoding is added in T056.
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 1, 2, 255, 217])
const pdf = new Uint8Array(new TextEncoder().encode('%PDF-1.7\nSynthetic\n%%EOF\n'))
const photoFile: BackupFile = { id: photo.fileId, purpose: 'photo', mime: 'image/jpeg', size: jpeg.length, base64: encodeBase64(jpeg) }
const documentFile: BackupFile = { id: document.fileId, purpose: 'document', mime: 'application/pdf', size: pdf.length, base64: encodeBase64(pdf) }
const empty: FullBackup = {
  format: 'health-diary-full', version: 1,
  text: { format: 'health-diary-text', version: 1, exportedAt: text.exportedAt, profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] },
  metadata: [], photos: [], documents: [], labResults: [], files: [],
}
const complete: FullBackup = {
  ...empty, text,
  metadata: [{ id: 'catalog-seeded', value: 'done' }, { id: 'synthetic-preference', value: '{"метка":"Пример 🧪"}' }],
  photos: [photo], documents: [document], labResults: [result, { ...result, id: id(802), value: { type: 'text', text: 'Синтетический текст' }, unit: '', reference: '' }],
  files: [photoFile, documentFile],
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-14T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

it('принимает вложения сегодняшнего дня аккаунта и отклоняет завтрашние во всех областях', () => {
  for (const patch of [
    { photos: [{ ...photo, date: '2026-10-16' }] },
    { documents: [{ ...document, date: '2026-10-16' }] },
    { labResults: [{ ...result, date: '2026-10-16' }] },
  ]) {
    const input = { ...complete, ...patch }
    expect(readFullBackup(input, '2026-10-16')).toEqual(input)
    expect(() => readFullBackup(input, '2026-10-15')).toThrow(/в будущем/)
    expect(() => readFullBackup(input)).toThrow(/в будущем/)
  }
  expect(() => readFullBackup(empty, '2026-02-30')).toThrow()
})

it('проверяет известную настройку видимости, сохраняя совместимость копий без неё и с другими настройками', () => {
  expect(readFullBackup(empty)).toEqual(empty)
  for (const flags of [{ version: 1, showPhotos: false, showDocuments: true }, { version: 1, showPhotos: true, showDocuments: false }]) {
    const input = { ...empty, metadata: [{ id: VISIBILITY_SETTING_ID, value: JSON.stringify(flags) }] }
    expect(readFullBackup(input)).toEqual(input)
  }
  for (const value of ['Синтетическая закрытая строка', '{}', 'null', JSON.stringify({ version: 2, showPhotos: true, showDocuments: true }), JSON.stringify({ version: 1, showPhotos: 'false', showDocuments: true }), JSON.stringify({ version: 1, showPhotos: true, showDocuments: true, extra: 'x' })]) {
    expect(() => readFullBackup({ ...empty, metadata: [{ id: VISIBILITY_SETTING_ID, value }] })).toThrow()
  }
  const opaque = { ...empty, metadata: [{ id: 'synthetic-other-setting', value: 'Синтетическая строка' }] }
  expect(readFullBackup(opaque)).toEqual(opaque)
})

it('принимает пустую копию и сериализует все разделы, Unicode, null/0 и будущую версию плана без мутации', () => {
  expect(readFullBackup(empty)).toEqual(empty)
  const original = structuredClone(complete)
  const serialized = serializeFullBackup(complete)
  const parsed: unknown = JSON.parse(serialized)
  expect(readFullBackup(parsed)).toEqual(complete)
  expect(complete).toEqual(original)
  expect(new TextEncoder().encode(serialized).byteLength).toBeGreaterThan(serialized.length)
  expect(serialized).not.toContain('\n')
})

it('проверяет версию, обязательные массивы, строгие поля и даты всех новых записей', () => {
  const invalid: unknown[] = [
    null, { ...empty, format: 'unknown' }, { ...empty, version: 2 }, { ...empty, files: undefined },
    { ...empty, photos: undefined }, { ...empty, documents: undefined }, { ...empty, labResults: undefined },
    { ...empty, metadata: undefined }, { ...empty, extra: true },
    { ...complete, photos: [{ ...photo, date: '2026-10-15' }] },
    { ...complete, documents: [{ ...document, date: '2026-10-15' }] },
    { ...complete, labResults: [{ ...result, date: '2026-10-15' }] },
    { ...complete, files: [{ ...photoFile, originalName: 'synthetic.jpg' }, documentFile] },
  ]
  for (const input of invalid) expect(() => readFullBackup(input)).toThrow()
})

it('повторно проверяет семантику текстовой копии, finite значения и служебную отметку каталога', () => {
  for (const input of [
    { ...complete, text: { ...text, products: [] } },
    { ...complete, text: { ...text, weights: [{ id: id(101), date: '2026-10-15', kg: 70 }] } },
    { ...complete, text: { ...text, energyPlans: text.energyPlans.map(plan => ({ ...plan, method: 'none' })) } },
    { ...complete, labResults: [{ ...result, value: { type: 'number', number: Infinity, operator: 'eq' } }] },
    { ...complete, metadata: [{ id: 'catalog-seeded', value: 'unknown' }] },
  ]) expect(() => readFullBackup(input)).toThrow()
  expect(() => serializeFullBackup({ ...complete, extra: true })).toThrow()
})

it('отвергает повторяющиеся ID каждой таблицы и повторное владение файлом внутри или между разделами', () => {
  for (const key of ['metadata', 'photos', 'documents', 'labResults', 'files'] as const) {
    const records = complete[key]
    expect(() => readFullBackup({ ...complete, [key]: [...records, records[0]] })).toThrow('Повторяющиеся идентификаторы полной копии')
  }
  expect(() => readFullBackup({ ...complete, photos: [photo, { ...photo, id: id(502) }] })).toThrow('Повторяющиеся идентификаторы полной копии')
  expect(() => readFullBackup({ ...complete, documents: [{ ...document, fileId: photo.fileId }] })).toThrow('Повторяющиеся идентификаторы полной копии')
})

it('отвергает отсутствующие и бесхозные файлы, неверное назначение и потерянный источник показателя', () => {
  for (const input of [
    { ...complete, files: [photoFile] },
    { ...complete, files: [...complete.files, { ...documentFile, id: id(703) }] },
    { ...complete, photos: [{ ...photo, fileId: id(999) }] },
    { ...complete, files: [{ ...photoFile, purpose: 'document' }, documentFile] },
    { ...complete, files: [photoFile, { ...documentFile, purpose: 'photo' }] },
    { ...complete, labResults: [{ ...result, documentId: id(999) }] },
  ]) expect(() => readFullBackup(input)).toThrow()
})

it('связывает канонический Base64 с объявленным размером и требует подготовленный JPEG для фото', () => {
  for (const base64 of ['', 'AB==', 'AA=', 'AA_A', 'AA==\n', 'AAA=']) {
    expect(() => readFullBackup({ ...complete, files: [{ ...photoFile, size: 1, base64 }, documentFile] })).toThrow('Некорректные данные Base64 файла')
  }
  for (const file of [
    { ...photoFile, mime: 'image/png' }, { ...photoFile, size: PHOTO_MAX_BYTES + 1 },
    { ...documentFile, size: 0 }, { ...documentFile, size: DOCUMENT_MAX_BYTES + 1 },
  ]) expect(() => readFullBackup({ ...complete, files: file.id === photoFile.id ? [file, documentFile] : [photoFile, file] })).toThrow()
})

it('принимает ровно 100 MiB связанных файлов и отвергает превышение на один байт', () => {
  const base64 = encodeBase64(new Uint8Array(DOCUMENT_MAX_BYTES))
  const documents = Array.from({ length: 5 }, (_, index) => ({ ...document, id: id(9000 + index), fileId: id(9500 + index) }))
  const files = documents.map(record => ({ ...documentFile, id: record.fileId, size: DOCUMENT_MAX_BYTES, base64 }))
  const boundary = { ...empty, documents, files }
  expect(readFullBackup(boundary).files).toHaveLength(5)
  const additional = { ...document, id: id(9998), fileId: id(9999) }
  expect(() => readFullBackup({ ...boundary, documents: [...documents, additional], files: [...files, { ...documentFile, id: additional.fileId, size: 1, base64: 'AA==' }] })).toThrow('Вложения копии превышают 100 MiB')
})

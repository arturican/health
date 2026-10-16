// @vitest-environment node
import { IDBFactory, IDBDatabase as FakeDatabase } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { exportBrowserDiary } from './browserExport'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-14T12:00:00Z')) })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

async function create(factory: IDBFactory, rows: Record<string, unknown[]>) {
  const request = factory.open('health-diary', 120)
  request.onupgradeneeded = () => {
    for (const [name, values] of Object.entries(rows)) {
      const store = request.result.createObjectStore(name, { keyPath: 'id' })
      for (const value of values) store.put(value)
    }
  }
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => { request.result.close(); resolve() }
    request.onerror = () => { reject(new Error('Не создана тестовая база')) }
  })
}

it('не создаёт отсутствующую базу и не записывает данные при ошибке', async () => {
  const factory = new IDBFactory()
  await expect(exportBrowserDiary(factory)).rejects.toThrow('не найдена')
  expect(await factory.databases()).toEqual([])
})

it('читает согласованный снимок только readonly и сохраняет исходные байты/версию', async () => {
  const factory = new IDBFactory()
  const bytes = '%PDF-1.7\nSynthetic old document\n%%EOF\n'
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const fileId = '20000000-0000-4000-8000-000000000001'
  const documentId = '20000000-0000-4000-8000-000000000002'
  await create(factory, {
    profiles: [{ id: 'self', name: 'Учебный прежний профиль', heightCm: 170, birthDate: null, formulaSex: 'none' }],
    documents: [{ id: documentId, fileId, date: '2026-10-14', kind: 'lab', title: 'Учебный PDF', note: '' }],
    files: [{ id: fileId, purpose: 'document', mime: 'application/pdf', size: blob.size, blob }],
    metadata: [{ id: 'diary-generation', value: 'synthetic' }, { id: 'catalog-seeded', value: 'done' }],
  })
  const transact = vi.spyOn(FakeDatabase.prototype, 'transaction')
  const first = await exportBrowserDiary(factory)
  expect(first.text.profile?.name).toBe('Учебный прежний профиль')
  expect(first.files[0]?.base64).toBe(Buffer.from(bytes).toString('base64'))
  expect(first.metadata).toEqual([{ id: 'catalog-seeded', value: 'done' }])
  expect(first.documents[0]?.fileId).toBe(fileId)
  expect(await exportBrowserDiary(factory)).toEqual(first)
  expect(transact.mock.calls.every(call => call[1] === 'readonly')).toBe(true)
  expect(await factory.databases()).toEqual([{ name: 'health-diary', version: 120 }])
})

it('не отбрасывает второй профиль и не меняет повреждённую базу', async () => {
  const factory = new IDBFactory()
  await create(factory, { profiles: [{ id: 'self' }, { id: 'another' }] })
  await expect(exportBrowserDiary(factory)).rejects.toThrow('несколько профилей')
  await expect(exportBrowserDiary(factory)).rejects.toThrow('несколько профилей')
  expect(await factory.databases()).toEqual([{ name: 'health-diary', version: 120 }])
})

it('проверяет связи файлов и метаданные до выдачи копии', async () => {
  const factory = new IDBFactory()
  await create(factory, { metadata: [{ id: 'section-visibility', value: 'synthetic-invalid' }] })
  await expect(exportBrowserDiary(factory)).rejects.toThrow()
  expect(await factory.databases()).toEqual([{ name: 'health-diary', version: 120 }])
})

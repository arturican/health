import { afterEach, expect, it, vi } from 'vitest'
import { downloadBlob, downloadJson } from './download'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('скачивает JSON через локальный Blob, затем удаляет ссылку и освобождает URL', async () => {
  const create = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:synthetic-backup')
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  const observed: { filename?: string; href?: string; attached?: boolean } = {}
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    observed.filename = this.download
    observed.href = this.href
    observed.attached = this.isConnected
  })
  const contents = '{"пример":"тест"}'
  downloadJson(contents, 'health-diary-text-2026-10-14.json')
  expect(observed).toEqual({ filename: 'health-diary-text-2026-10-14.json', href: 'blob:synthetic-backup', attached: true })
  const blob = create.mock.calls[0]?.[0]
  expect(blob?.type).toBe('application/json')
  expect(blob?.size).toBe(new TextEncoder().encode(contents).byteLength)
  expect(document.querySelector('a')).toBeNull()
  await Promise.resolve()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:synthetic-backup')
})

it('освобождает URL и удаляет временную ссылку даже при ошибке скачивания', async () => {
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:synthetic-error', revokeObjectURL: revoke })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('Синтетический отказ') })
  expect(() => { downloadJson('{}', 'synthetic.json') }).toThrow('Синтетический отказ')
  expect(document.querySelector('a')).toBeNull()
  await Promise.resolve()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:synthetic-error')
})

it('скачивает исходный Blob без пересоздания и освобождает URL после actual DOM-click', async () => {
  const blob = new Blob(['%PDF-1.7\nSynthetic\n%%EOF\n'], { type: 'application/pdf' })
  const create = vi.fn<(value: Blob) => string>().mockReturnValue('blob:synthetic-original')
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  const observed: { filename?: string; attached?: boolean; href?: string } = {}
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    observed.filename = this.download
    observed.attached = this.isConnected
    observed.href = this.href
  })
  downloadBlob(blob, 'health-document-00000000-0000-4000-8000-000000000001.pdf')
  expect(create).toHaveBeenCalledExactlyOnceWith(blob)
  expect(observed).toEqual({ filename: 'health-document-00000000-0000-4000-8000-000000000001.pdf', attached: true, href: 'blob:synthetic-original' })
  expect(document.querySelector('a')).toBeNull()
  await Promise.resolve()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:synthetic-original')
})

it('освобождает уже созданный URL при отказе создания DOM-ссылки', async () => {
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:synthetic-create-error', revokeObjectURL: revoke })
  vi.spyOn(document, 'createElement').mockImplementationOnce(() => { throw new Error('Синтетический отказ создания ссылки') })
  expect(() => { downloadBlob(new Blob(['synthetic']), 'synthetic.pdf') }).toThrow('Синтетический отказ создания ссылки')
  expect(document.querySelector('a')).toBeNull()
  await Promise.resolve()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:synthetic-create-error')
})

it('удаляет ссылку и освобождает URL при отказе её добавления в документ', async () => {
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:synthetic-append-error', revokeObjectURL: revoke })
  vi.spyOn(document.body, 'append').mockImplementationOnce(() => { throw new Error('Синтетический отказ добавления ссылки') })
  expect(() => { downloadBlob(new Blob(['synthetic']), 'synthetic.pdf') }).toThrow('Синтетический отказ добавления ссылки')
  expect(document.querySelector('a')).toBeNull()
  await Promise.resolve()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:synthetic-append-error')
})

it('не оставляет ссылку и не отзывает отсутствующий URL при отказе createObjectURL', () => {
  const revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal('URL', { createObjectURL: () => { throw new Error('Синтетический отказ URL') }, revokeObjectURL: revoke })
  expect(() => { downloadBlob(new Blob(['synthetic']), 'synthetic.pdf') }).toThrow('Синтетический отказ URL')
  expect(document.querySelector('a')).toBeNull()
  expect(revoke).not.toHaveBeenCalled()
})

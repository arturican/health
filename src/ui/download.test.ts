import { afterEach, expect, it, vi } from 'vitest'
import { downloadJson } from './download'

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

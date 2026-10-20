import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentFile } from './DocumentFile'
import { getFile } from '../data/fileRepository'
import type { StoredFile } from '../domain/storedFile'
import type { AttachmentMime } from '../domain/attachment'

vi.mock('../data/fileRepository', () => ({ getFile: vi.fn() }))
vi.mock('../ui/BlobImage', () => ({ BlobImage: ({ alt }: { alt: string }) => <img alt={alt} src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKz8AAAAASUVORK5CYII=" /> }))

const firstId = '00000000-0000-4000-8000-000000000001'
const secondId = '00000000-0000-4000-8000-000000000002'
const create = vi.fn<(blob: Blob) => string>()
const revoke = vi.fn<(url: string) => void>()
function file(id = firstId, mime: AttachmentMime = 'application/pdf'): StoredFile {
  const blob = new Blob(['synthetic-validated-file-bytes'], { type: mime })
  return { id, blob, size: blob.size, mime, purpose: 'document' }
}

beforeEach(() => {
  create.mockReset().mockReturnValue('blob:synthetic-document')
  revoke.mockReset()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  vi.mocked(getFile).mockReset().mockResolvedValue(file())
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([
  ['application/pdf', 'pdf'], ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
] as const)('скачивает исходный %s только по кнопке, используя UUID и подтверждённое расширение %s', async (mime, extension) => {
  const stored = file(firstId, mime)
  vi.mocked(getFile).mockResolvedValue(stored)
  let observedName = ''
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { observedName = this.download })
  const title = '../Синтетический документ.exe'
  const view = render(<DocumentFile fileId={firstId} title={title} />)
  fireEvent.click(screen.getByRole('button', { name: `Открыть вложение: ${title}` }))
  const button = await screen.findByRole('button', { name: `Скачать оригинал: ${title}` })
  expect(create).not.toHaveBeenCalled()
  expect(getFile).toHaveBeenCalledWith(firstId)
  if (mime === 'application/pdf') {
    expect(screen.getByText(/PDF доступен для скачивания/)).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  } else expect(screen.getByRole('img', { name: `Документ: ${title}` })).toBeVisible()
  expect(view.container.querySelector('iframe, object, embed')).toBeNull()
  fireEvent.click(button)
  expect(await screen.findByRole('status')).toHaveTextContent('Скачивание оригинала начато')
  expect(create).toHaveBeenCalledExactlyOnceWith(stored.blob)
  expect(observedName).toBe(`health-document-${firstId}.${extension}`)
  expect(document.querySelector('a')).toBeNull()
  await waitFor(() => { expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:synthetic-document') })
})

it.each(['missing', 'read-error', 'wrong-purpose'])('показывает безопасную ошибку %s без исходных деталей или кнопки', async kind => {
  if (kind === 'missing') vi.mocked(getFile).mockResolvedValue(null)
  else if (kind === 'read-error') vi.mocked(getFile).mockRejectedValue(new Error('Синтетическое закрытое имя файла'))
  else vi.mocked(getFile).mockResolvedValue({ ...file(), purpose: 'photo' })
  render(<DocumentFile fileId={firstId} title="Синтетический документ" />)
  fireEvent.click(screen.getByRole('button', { name: 'Открыть вложение: Синтетический документ' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть вложение документа.')
  expect(screen.queryByText(/закрытое имя/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Скачать оригинал/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled()
})

it('не показывает старый файл во время загрузки нового или после позднего ответа старого запроса', async () => {
  let resolveOld: ((value: StoredFile) => void) | undefined
  const oldRequest = new Promise<StoredFile>(resolve => { resolveOld = resolve })
  vi.mocked(getFile).mockReturnValueOnce(oldRequest).mockResolvedValue(file(secondId, 'image/png'))
  const view = render(<DocumentFile fileId={firstId} title="Прежний документ" />)
  fireEvent.click(screen.getByRole('button', { name: 'Открыть вложение: Прежний документ' }))
  await waitFor(() => { expect(getFile).toHaveBeenCalledWith(firstId) })
  view.rerender(<DocumentFile fileId={secondId} title="Текущий документ" />)
  expect(screen.queryByRole('button', { name: /Скачать оригинал/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Открыть вложение: Текущий документ' }))
  expect(await screen.findByRole('img', { name: 'Документ: Текущий документ' })).toBeVisible()
  await act(async () => { resolveOld?.(file()); await Promise.resolve() })
  expect(screen.queryByRole('button', { name: 'Скачать оригинал: Прежний документ' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Скачать оригинал: Текущий документ' })).toBeVisible()
  expect(screen.getByRole('img', { name: 'Документ: Текущий документ' })).toBeVisible()
})

it('скрывает подробности ошибки скачивания и сохраняет кнопку для повторной попытки', async () => {
  create.mockImplementationOnce(() => { throw new Error('Синтетическая закрытая ошибка скачивания') })
  render(<DocumentFile fileId={firstId} title="Синтетический документ" />)
  fireEvent.click(screen.getByRole('button', { name: 'Открыть вложение: Синтетический документ' }))
  const button = await screen.findByRole('button', { name: 'Скачать оригинал: Синтетический документ' })
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent(/Не удалось/)
  expect(screen.queryByText('Синтетическая закрытая ошибка скачивания')).not.toBeInTheDocument()
  await waitFor(() => { expect(button).toBeEnabled() })
  fireEvent.click(button)
  expect(await screen.findByRole('status')).toHaveTextContent('Скачивание оригинала начато')
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:synthetic-document')
})

it('ошибка открывается повторно, close скрывает preview', async () => {
  vi.mocked(getFile).mockRejectedValueOnce(new Error('private')).mockResolvedValue(file(firstId, 'image/png'))
  const view = render(<DocumentFile fileId={firstId} title="Synthetic" />)
  const toggle = screen.getByRole('button', { name: 'Открыть вложение: Synthetic' })
  expect(getFile).not.toHaveBeenCalled()
  fireEvent.click(toggle)
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть вложение')
  fireEvent.click(screen.getByRole('button', { name: 'Повторить открытие' }))
  expect(toggle).toHaveFocus()
  expect(await screen.findByRole('img')).toBeVisible()
  expect(getFile).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть вложение: Synthetic' }))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(revoke).not.toHaveBeenCalled() // BlobImage renderer mocked here; real lifecycle in Request test.
  view.unmount()
})

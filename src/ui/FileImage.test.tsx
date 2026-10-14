import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getFile } from '../data/fileRepository'
import { type StoredFile } from '../domain/storedFile'
import { FileImage } from './FileImage'

vi.mock('../data/fileRepository', () => ({ getFile: vi.fn() }))
const firstId = '00000000-0000-4000-8000-000000000001'
const secondId = '00000000-0000-4000-8000-000000000002'
function file(id = firstId): StoredFile {
  const blob = new Blob(['synthetic'], { type: 'image/jpeg' })
  return { id, blob, size: blob.size, mime: 'image/jpeg', purpose: 'photo' }
}
const create = vi.fn<(blob: Blob) => string>()
const revoke = vi.fn<(url: string) => void>()
beforeEach(() => {
  create.mockReset().mockReturnValueOnce('blob:first').mockReturnValue('blob:second')
  revoke.mockReset()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  vi.mocked(getFile).mockReset().mockResolvedValue(file())
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('показывает только текущий файл и освобождает каждый URL при замене и закрытии', async () => {
  const view = render(<FileImage fileId={firstId} alt="Первый пример" width={10} height={20} />)
  expect(await screen.findByRole('img', { name: 'Первый пример' })).toHaveAttribute('src', 'blob:first')
  vi.mocked(getFile).mockResolvedValue(file(secondId))
  view.rerender(<FileImage fileId={secondId} alt="Второй пример" />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(await screen.findByRole('img', { name: 'Второй пример' })).toHaveAttribute('src', 'blob:second')
  await waitFor(() => { expect(revoke).toHaveBeenCalledWith('blob:first') })
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:second')
  expect(create).toHaveBeenCalledTimes(2)
})

it.each(['missing', 'read-error'])('показывает безопасную ошибку %s без содержимого файла', async kind => {
  if (kind === 'missing') vi.mocked(getFile).mockResolvedValue(null)
  else vi.mocked(getFile).mockRejectedValue(new Error('Синтетическое приватное имя'))
  render(<FileImage fileId={firstId} alt="Пример" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть файл изображения.')
  expect(screen.queryByText(/приватное/)).not.toBeInTheDocument()
  expect(create).not.toHaveBeenCalled()
})

it('обрабатывает отказ создания URL и отказ декодирования изображения', async () => {
  create.mockReset().mockImplementation(() => { throw new Error('private') })
  const view = render(<FileImage fileId={firstId} alt="Пример" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось показать изображение.')
  view.unmount()
  create.mockReturnValue('blob:decode-error')
  render(<FileImage fileId={firstId} alt="Другой пример" />)
  fireEvent.error(await screen.findByRole('img'))
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось показать изображение.')
})

it('не создаёт URL после закрытия до завершения чтения', async () => {
  let resolveFile: ((value: StoredFile) => void) | undefined
  vi.mocked(getFile).mockImplementation(() => new Promise(resolve => { resolveFile = resolve }))
  const view = render(<FileImage fileId={firstId} alt="Пример" />)
  await waitFor(() => { expect(getFile).toHaveBeenCalled() })
  view.unmount()
  resolveFile?.(file())
  await Promise.resolve()
  expect(create).not.toHaveBeenCalled()
})

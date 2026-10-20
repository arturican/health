import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentFile } from './DocumentFile'
import { getFile } from '../client/fileRepository'
import { setClientSession } from '../client/session'
import type { StoredFile } from '../domain/storedFile'
vi.unmock('../dataAccess')
vi.mock('../client/fileRepository',async()=>({...await vi.importActual<typeof import('../client/fileRepository')>('../client/fileRepository'),getFile:vi.fn()}))
vi.mock('../ui/BlobImage', () => ({ BlobImage: () => <img alt="Synthetic" src="data:image/png;base64,aQ==" /> }))
const firstId = '10000000-0000-4000-8000-000000000001'
const secondId = '10000000-0000-4000-8000-000000000002'
function file(id: string, mime: 'image/png'): StoredFile {
  const blob = new Blob(['synthetic'], { type: mime })
  return { id, mime, blob, size: blob.size, purpose: 'document' }
}
beforeEach(() => { setClientSession({ account: { id: firstId, login: 'alice', timezone: 'UTC' }, csrf: 'a'.repeat(64) }); vi.mocked(getFile).mockReset() })
afterEach(() => { cleanup(); setClientSession(null) })
it('A→B→A остаётся закрытым; повторное открытие pending того же файла не дублирует read', async () => {
  let resolve: (value: StoredFile) => void = () => { throw new Error('not ready') }
  vi.mocked(getFile).mockImplementation(() => new Promise(done => { resolve = done }))
  const view = render(<DocumentFile fileId={firstId} title="A" />)
  fireEvent.click(screen.getByRole('button', { name: 'Открыть вложение: A' }))
  await waitFor(() => { expect(getFile).toHaveBeenCalledTimes(1) })
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть вложение: A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Открыть вложение: A' }))
  await act(async () => { await Promise.resolve() })
  expect(getFile).toHaveBeenCalledTimes(1)
  await act(async () => { resolve(file(firstId, 'image/png')); await Promise.resolve() })
  expect(await screen.findByRole('img')).toBeVisible()
  view.rerender(<DocumentFile fileId={secondId} title="B" />)
  expect(screen.getByRole('button', { name: 'Открыть вложение: B' })).toHaveAttribute('aria-expanded', 'false')
  view.rerender(<DocumentFile fileId={firstId} title="A" />)
  expect(screen.getByRole('button', { name: 'Открыть вложение: A' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(getFile).toHaveBeenCalledTimes(1)
})

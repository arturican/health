import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DocumentFile } from './DocumentFile'
import { getFile } from '../data/fileRepository'
vi.mock('../data/fileRepository',()=>({getFile:vi.fn()}))
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('preview и download используют один проверенный Blob и освобождают URL',async()=>{
  const id='10000000-0000-4000-8000-000000000001'
  const blob=new Blob(['synthetic'],{type:'image/png'})
  vi.mocked(getFile).mockResolvedValue({id,blob,size:blob.size,mime:'image/png',purpose:'document'})
  const create=vi.fn().mockReturnValueOnce('blob:preview').mockReturnValue('blob:download')
  const revoke=vi.fn()
  vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke})
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined)
  const view=render(<DocumentFile fileId={id} title="Synthetic"/>)
  expect(await screen.findByRole('img',{name:'Документ: Synthetic'})).toHaveAttribute('src','blob:preview')
  expect(getFile).toHaveBeenCalledExactlyOnceWith(id)
  fireEvent.click(screen.getByRole('button',{name:'Скачать оригинал: Synthetic'}))
  expect(await screen.findByRole('status')).toHaveTextContent('Скачивание оригинала начато')
  expect(create.mock.calls).toEqual([[blob],[blob]])
  await waitFor(()=>{expect(revoke).toHaveBeenCalledWith('blob:download')})
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:preview')
})

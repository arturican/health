import { DocumentFile } from '../pages/DocumentFile'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FileImage } from './FileImage'
import { getFile, notifyFileDeleted } from '../client/fileRepository'
import { clientDiary, clientSession } from '../../tests/clientSession'
import { setClientSession } from '../client/session'
vi.unmock('../dataAccess')
vi.mock('../client/fileRepository',async()=>({...await vi.importActual<typeof import('../client/fileRepository')>('../client/fileRepository'),getFile:vi.fn()}))
const first='10000000-0000-4000-8000-000000000001',second='20000000-0000-4000-8000-000000000002'
const revoke=vi.fn()
beforeEach(()=>{
  setClientSession(clientSession,clientDiary)
  vi.mocked(getFile).mockReset().mockImplementation(id=>{
    if(typeof id!=='string') throw new Error('Invalid fixture')
    const blob=new Blob(['synthetic'],{type:'image/png'})
    return Promise.resolve({id,blob,mime:'image/png',purpose:'document',size:blob.size})
  })
  revoke.mockReset()
  vi.stubGlobal('URL',{createObjectURL:vi.fn().mockReturnValueOnce('blob:first').mockReturnValue('blob:second'),revokeObjectURL:revoke})
})
afterEach(()=>{cleanup();setClientSession(null);vi.unstubAllGlobals()})
it('подтверждённое удаление убирает Blob/URL при прежнем DTO, не затрагивает соседний',async()=>{
  render(<><FileImage fileId={first} alt="First"/><FileImage fileId={second} alt="Second"/></>)
  await screen.findByRole('img',{name:'First'});await screen.findByRole('img',{name:'Second'})
  act(()=>{notifyFileDeleted(first)})
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть файл')
  expect(screen.queryByRole('img',{name:'First'})).not.toBeInTheDocument()
  expect(screen.getByRole('img',{name:'Second'})).toBeVisible()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:first')
  expect(getFile).toHaveBeenCalledTimes(2)
})

it('удалённый документ теряет кнопку скачивания без свежего списка',async()=>{
  const blob=new Blob(['%PDF-1.7\nsynthetic\n%%EOF\n'],{type:'application/pdf'})
  vi.mocked(getFile).mockResolvedValue({id:first,blob,mime:'application/pdf',purpose:'document',size:blob.size})
  render(<DocumentFile fileId={first} title="Synthetic"/>)
  fireEvent.click(screen.getByRole('button',{name:'Открыть вложение: Synthetic'}))
  await screen.findByRole('button',{name:'Скачать оригинал: Synthetic'})
  act(()=>{notifyFileDeleted(first)})
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть вложение документа')
  expect(screen.queryByRole('button',{name:'Скачать оригинал: Synthetic'})).not.toBeInTheDocument()
  expect(getFile).toHaveBeenCalledTimes(1)
})

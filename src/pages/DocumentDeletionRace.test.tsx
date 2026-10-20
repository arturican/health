import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentFile } from './DocumentFile'
import { notifyFileDeleted } from '../client/fileRepository'
import { setClientSession } from '../client/session'
import { clientDiary, clientSession } from '../../tests/clientSession'
vi.unmock('../dataAccess')
const id='10000000-0000-4000-8000-000000000001'
const network=vi.fn<typeof fetch>()
beforeEach(()=>{setClientSession(clientSession,clientDiary);network.mockReset();vi.stubGlobal('fetch',network)})
afterEach(()=>{cleanup();setClientSession(null);vi.unstubAllGlobals()})
it.each(['retry','close-open'] as const)('старый GET после DELETE не возвращается через %s',async kind=>{
  let resolve:(response:Response)=>void=()=>{throw new Error('not ready')}
  network.mockReturnValueOnce(new Promise(done=>{resolve=done}))
  render(<DocumentFile fileId={id} title="Synthetic"/>)
  fireEvent.click(screen.getByRole('button',{name:'Открыть вложение: Synthetic'}))
  await waitFor(()=>{expect(network).toHaveBeenCalledTimes(1)})
  if(kind==='close-open') fireEvent.click(screen.getByRole('button',{name:'Закрыть вложение: Synthetic'}))
  act(()=>{notifyFileDeleted(id)})
  if(kind==='close-open') fireEvent.click(screen.getByRole('button',{name:'Открыть вложение: Synthetic'}))
  else {
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button',{name:'Повторить открытие'}))
  }
  await act(async()=>{
    resolve(new Response('%PDF-1.7\nsynthetic-old-response\n%%EOF\n',{headers:{'Content-Type':'application/pdf','X-File-Purpose':'document','X-Account-Id':clientSession.account.id}}))
    await Promise.resolve()
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть вложение документа')
  expect(screen.queryByRole('button',{name:'Скачать оригинал: Synthetic'})).not.toBeInTheDocument()
  expect(network).toHaveBeenCalledTimes(1)
})

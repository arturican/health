import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useFileReader } from './useFileReader'
import { getFile } from '../client/fileRepository'
import { ApiError } from '../client/http'
import { clientDiary, clientSession } from '../../tests/clientSession'
import { setClientSession } from '../client/session'
vi.unmock('../dataAccess')
vi.mock('../client/fileRepository',()=>({getFile:vi.fn()}))
const id='10000000-0000-4000-8000-000000000001'
const blob=new Blob(['synthetic'],{type:'image/png'})
const file={id,blob,mime:'image/png',purpose:'document',size:blob.size} as const
beforeEach(()=>{setClientSession(clientSession,clientDiary);vi.mocked(getFile).mockReset().mockResolvedValue(file)})
afterEach(()=>{cleanup();setClientSession(null)})
it('кеширует positive result и объединяет pending, не кеширует null/errors',async()=>{
  let resolve:(value:typeof file)=>void=()=>{throw new Error('not ready')}
  const pending=new Promise<typeof file>(done=>{resolve=done})
  vi.mocked(getFile).mockReturnValueOnce(pending)
  const hook=renderHook(()=>useFileReader(id))
  const first=hook.result.current.readFile(),second=hook.result.current.readFile()
  resolve(file)
  expect(await first).toBe(file);expect(await second).toBe(file)
  expect(await hook.result.current.readFile()).toBe(file)
  expect(getFile).toHaveBeenCalledTimes(1)
  hook.unmount()
  vi.mocked(getFile).mockReset().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('synthetic')).mockResolvedValue(file)
  const next=renderHook(()=>useFileReader(id))
  expect(await next.result.current.readFile()).toBeNull()
  await expect(next.result.current.readFile()).rejects.toThrow('synthetic')
  expect(await next.result.current.readFile()).toBe(file)
  expect(getFile).toHaveBeenCalledTimes(3)
})
it('id/generation/owner/logout не получают прошлый Blob',async()=>{
  const hook=renderHook(({fileId})=>useFileReader(fileId),{initialProps:{fileId:id}})
  await hook.result.current.readFile()
  hook.rerender({fileId:'20000000-0000-4000-8000-000000000002'})
  await hook.result.current.readFile()
  act(()=>{setClientSession(clientSession,{...clientDiary,generation:'30000000-0000-4000-8000-000000000003'})})
  await hook.result.current.readFile()
  act(()=>{setClientSession({...clientSession,account:{...clientSession.account,id:'40000000-0000-4000-8000-000000000004'}},clientDiary)})
  await hook.result.current.readFile()
  expect(getFile).toHaveBeenCalledTimes(4)
  vi.mocked(getFile).mockRejectedValue(new ApiError(401))
  act(()=>{setClientSession(null)})
  await expect(hook.result.current.readFile()).rejects.toMatchObject({status:401})
  expect(getFile).toHaveBeenCalledTimes(5)
})
it.each(['unmount','owner'] as const)('late response после %s не попадает в cache',async kind=>{
  let resolve:(value:typeof file)=>void=()=>{throw new Error('not ready')}
  vi.mocked(getFile).mockReturnValueOnce(new Promise(done=>{resolve=done}))
  const hook=renderHook(()=>useFileReader(id))
  const pending=hook.result.current.readFile()
  const rejected=expect(pending).rejects.toThrow('прежнему просмотру')
  if(kind==='unmount') hook.unmount()
  else act(()=>{setClientSession({...clientSession,account:{...clientSession.account,id:'40000000-0000-4000-8000-000000000004'}},clientDiary)})
  resolve(file)
  await rejected
  if(kind==='owner'){
    expect(await hook.result.current.readFile()).toBe(file)
    expect(getFile).toHaveBeenCalledTimes(2)
  }
})

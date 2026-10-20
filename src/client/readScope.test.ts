import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'
import { consistentRead, type ReadScope } from './readState'
import { readPages } from './pages'
import { setClientSession } from './session'
const network=vi.fn<typeof fetch>()
beforeEach(()=>{
  setClientSession(clientSession,clientDiary);network.mockReset()
  network.mockImplementation(path=>Promise.resolve(jsonResponse((typeof path === 'string' && path.includes('diary-state'))?clientDiary:{items:[1],nextAfter:null})))
  vi.stubGlobal('fetch',network)
})
afterEach(()=>{setClientSession(null);vi.unstubAllGlobals()})
it('два scoped paged reads имеют только одну внешнюю пару fences',async()=>{
  await expect(consistentRead(scope=>Promise.all([readPages('/api/v1/a',z.number(),'after',scope),readPages('/api/v1/b',z.number(),'after',scope)]))).resolves.toEqual([[1],[1]])
  expect(network).toHaveBeenCalledTimes(4)
})
it('scope нельзя использовать после успеха/отказа callback',async()=>{
  let saved:ReadScope|undefined
  await consistentRead(scope=>{saved=scope;return Promise.resolve(null)})
  if(!saved) throw new Error('No scope')
  await expect(readPages('/api/v1/a',z.number(),'after',saved)).rejects.toMatchObject({status:409})
  expect(network).toHaveBeenCalledTimes(2)
  await expect(consistentRead(scope=>{saved=scope;return Promise.reject(new Error('synthetic'))})).rejects.toThrow('synthetic')
  await expect(readPages('/api/v1/a',z.number(),'after',saved)).rejects.toMatchObject({status:409})
  expect(network).toHaveBeenCalledTimes(3)
})
it('не передаёт scope неявно в независимый readPages',async()=>{
  await expect(consistentRead(()=>readPages('/api/v1/a',z.number()))).resolves.toEqual([1])
  expect(network).toHaveBeenCalledTimes(5)
})
it('смена revision между страницами повторяет всю область',async()=>{
  let states=0, pages=0
  network.mockImplementation(path=>{
    if((typeof path === 'string' && path.includes('diary-state'))) return Promise.resolve(jsonResponse({...clientDiary,changeRevision:states++===0?0:1}))
    pages++
    return Promise.resolve(jsonResponse(pages%2===1?{items:Array.from({length:100},()=>pages),nextAfter:'next'}:{items:[pages],nextAfter:null}))
  })
  const value=await consistentRead(scope=>readPages('/api/v1/a',z.number(),'after',scope))
  expect(value).toHaveLength(101);expect(value[0]).toBe(3);expect(value[100]).toBe(4)
  expect(states).toBe(4);expect(pages).toBe(4)
})

it('завершение параллельной области не закрывает ещё работающую',async()=>{
  let first:ReadScope|undefined
  let release:()=>void=()=>{throw new Error('not ready')}
  let entered:()=>void=()=>{throw new Error('not ready')}
  const waiting=new Promise<void>(done=>{release=done})
  const ready=new Promise<void>(done=>{entered=done})
  const pending=consistentRead(scope=>{first=scope;entered();return waiting})
  await ready
  await consistentRead(()=>Promise.resolve(null))
  if(!first) throw new Error('No first scope')
  await expect(readPages('/api/v1/a',z.number(),'after',first)).resolves.toEqual([1])
  release()
  await pending
  await expect(readPages('/api/v1/a',z.number(),'after',first)).rejects.toMatchObject({status:409})
})

it.each([null, 'next'])('неожидаемая страница с cursor %s отклоняется после выхода callback',async cursor=>{
  let resolvePage:(value:Response)=>void=()=>{throw new Error('not ready')}
  const page=new Promise<Response>(done=>{resolvePage=done})
  let escaped:Promise<number[]>|undefined
  network.mockImplementation(path=>(typeof path==='string'&&path.includes('diary-state'))?Promise.resolve(jsonResponse(clientDiary)):page)
  await consistentRead(scope=>{escaped=readPages('/api/v1/a',z.number(),'after',scope);return Promise.resolve(null)})
  if(!escaped) throw new Error('No escaped page')
  const rejected=expect(escaped).rejects.toMatchObject({status:409})
  resolvePage(jsonResponse({items:Array.from({length:100},()=>1),nextAfter:cursor}))
  await rejected
  expect(network).toHaveBeenCalledTimes(3)
})
it.each(['owner','generation'] as const)('pending scoped page не возвращается после смены %s',async kind=>{
  let resolvePage:(value:Response)=>void=()=>{throw new Error('not ready')}
  let entered:()=>void=()=>{throw new Error('not ready')}
  const ready=new Promise<void>(done=>{entered=done})
  const page=new Promise<Response>(done=>{resolvePage=done})
  network.mockImplementation(path=>{
    if(typeof path==='string'&&path.includes('diary-state')) return Promise.resolve(jsonResponse(clientDiary))
    entered();return page
  })
  const pending=consistentRead(scope=>readPages('/api/v1/a',z.number(),'after',scope))
  const rejected=expect(pending).rejects.toThrow('Запрос относится к прежнему входу')
  await ready
  if(kind==='owner') setClientSession({...clientSession,account:{...clientSession.account,id:'20000000-0000-4000-8000-000000000002'}},clientDiary)
  else setClientSession(clientSession,{...clientDiary,generation:'20000000-0000-4000-8000-000000000002'})
  resolvePage(jsonResponse({items:Array.from({length:100},()=>1),nextAfter:'next'}))
  await rejected
  expect(network).toHaveBeenCalledTimes(2)
})

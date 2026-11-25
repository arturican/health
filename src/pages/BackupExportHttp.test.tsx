import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FullBackupExport } from './FullBackupExport'
import { setClientSession } from '../client/session'
import { downloadBlob } from '../ui/download'
vi.unmock('../dataAccess')
vi.mock('../ui/download',()=>({downloadBlob:vi.fn(),downloadJson:vi.fn()}))
const owner='10000000-0000-4000-8000-000000000001'
const network=vi.fn<typeof fetch>()
beforeEach(()=>{setClientSession({account:{id:owner,login:'alice',timezone:'UTC'},csrf:'a'.repeat(64)});network.mockReset();vi.stubGlobal('fetch',network);vi.mocked(downloadBlob).mockReset()})
afterEach(()=>{cleanup();setClientSession(null);vi.unstubAllGlobals()})
it('настоящий HTTP413 виден пользователю, download не вызывается, повтор успешен',async()=>{
  const original = JSON.stringify({
    format:'health-diary-full',version:1,text:{format:'health-diary-text',version:1,exportedAt:'2026-10-15T12:00:00Z',profile:null,weights:[],products:[],foodEntries:[],nutritionDays:[],steps:[],workouts:[],energyPlans:[]},
    metadata:[],photos:[],documents:[],labResults:[],files:[],
  }, null, 2) + '\n'
  network.mockResolvedValueOnce(new Response('private',{status:413}))
    .mockResolvedValueOnce(new Response(original,{headers:{'X-Account-Id':owner,'Content-Type':'application/json'}}))
  render(<FullBackupExport/>)
  fireEvent.click(screen.getByRole('button',{name:'Скачать полную копию'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Полная копия превышает 200 MiB')
  expect(screen.getByRole('alert')).toHaveTextContent('Обратитесь к администратору')
  expect(downloadBlob).not.toHaveBeenCalled()
  await waitFor(()=>{expect(screen.getByRole('button',{name:'Скачать полную копию'})).toBeEnabled()})
  fireEvent.click(screen.getByRole('button',{name:'Скачать полную копию'}))
  expect(await screen.findByRole('status')).toHaveTextContent('Полная копия подготовлена')
  expect(downloadBlob).toHaveBeenCalledTimes(1)
  expect(await vi.mocked(downloadBlob).mock.calls[0]?.[0].text()).toBe(original)
})

it('отклоняет ответ с неверной схемой до скачивания',async()=>{
  network.mockResolvedValueOnce(new Response('{"format":"health-diary-full"}',{headers:{'X-Account-Id':owner}}))
  render(<FullBackupExport />)
  fireEvent.click(screen.getByRole('button',{name:'Скачать полную копию'}))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(downloadBlob).not.toHaveBeenCalled()
})

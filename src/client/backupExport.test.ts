import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { exportFullBackup, exportTextBackup } from './backupRepository'
import { getClientSession, setClientSession } from './session'
const account={id:'10000000-0000-4000-8000-000000000001',login:'alice',timezone:'UTC'}
const network=vi.fn<typeof fetch>()
beforeEach(()=>{setClientSession({account,csrf:'a'.repeat(64)});network.mockReset();vi.stubGlobal('fetch',network)})
afterEach(()=>{setClientSession(null);vi.unstubAllGlobals()})
it('text413 предлагает явный full, не вызывает его автоматически и не читает error body',async()=>{
  const body=vi.fn();network.mockResolvedValue(Object.assign(new Response('private',{status:413}),{json:body}))
  await expect(exportTextBackup()).rejects.toThrow('Текстовая копия превышает 20 MiB')
  expect(network).toHaveBeenCalledTimes(1)
  expect(network.mock.calls[0]?.[0]).toBe('/api/v1/backup/text')
  expect(body).not.toHaveBeenCalled()
  await expect(exportFullBackup()).rejects.toThrow('Обратитесь к администратору')
  expect(getClientSession().session?.account).toEqual(account)
})
it('сохраняет401 и сбрасывает session вместо ложного size сообщения',async()=>{
  network.mockResolvedValue(new Response(null,{status:401}))
  await expect(exportTextBackup()).rejects.toMatchObject({status:401})
  expect(getClientSession().session).toBeNull()
})

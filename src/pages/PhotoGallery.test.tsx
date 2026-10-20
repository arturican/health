import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PhotoGallery } from './PhotoGallery'
import { listPhotos, deletePhoto } from '../client/photoRepository'
import { getFile } from '../client/fileRepository'
import { invalidateQueries } from '../client/queries'
import type { Photo } from '../domain/photo'
vi.unmock('../dataAccess')
vi.mock('../client/photoRepository',()=>({listPhotos:vi.fn(),deletePhoto:vi.fn()}))
vi.mock('../client/fileRepository',()=>({getFile:vi.fn()}))
const photos:Photo[]=Array.from({length:50},(_,i)=>({id:'photo-'+String(i),fileId:'file-'+String(i),date:'2026-10-15',title:'Synthetic '+String(i),note:'',width:2,height:3}))
const changed=vi.fn()
beforeEach(()=>{
  vi.mocked(listPhotos).mockReset().mockResolvedValue(photos)
  vi.mocked(deletePhoto).mockReset().mockResolvedValue(undefined)
  const blob=new Blob([new Uint8Array(2*1024*1024)],{type:'image/jpeg'})
  vi.mocked(getFile).mockReset().mockImplementation(id=>{
    if (typeof id !== 'string') throw new Error('Invalid synthetic id')
    return Promise.resolve({id,purpose:'photo',mime:'image/jpeg',size:blob.size,blob})
  })
  vi.stubGlobal('URL',{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:vi.fn()})
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('100MiB model загружает≤6фото; страницы доступны, край/удаление не оставляют пустую страницу',async()=>{
  const view=render(<PhotoGallery onEdit={vi.fn()} blocked={false} onBusyChange={changed}/>)
  await screen.findByRole('img',{name:'Synthetic 0'})
  expect(getFile).toHaveBeenCalledTimes(6)
  expect(screen.getAllByRole('img')).toHaveLength(6)
  expect(screen.getByRole('button',{name:'Предыдущие фото'})).toBeDisabled()
  for(let n=1;n<=8;n++){
    fireEvent.click(screen.getByRole('button',{name:'Следующие фото'}))
    await screen.findByRole('img',{name:'Synthetic '+String(n*6)})
  }
  expect(screen.getAllByRole('img')).toHaveLength(2)
  expect(screen.getByRole('button',{name:'Следующие фото'})).toBeDisabled()
  expect(screen.getByRole('heading',{name:'Галерея фото'})).toHaveFocus()
  vi.mocked(deletePhoto).mockImplementation(() => {
    vi.mocked(listPhotos).mockResolvedValue(photos.slice(0,48))
    invalidateQueries()
    return Promise.resolve()
  })
  view.rerender(<PhotoGallery onEdit={vi.fn()} blocked={false} onBusyChange={changed}/>)
  fireEvent.click(screen.getByRole('button',{name:'Удалить фото 49: Synthetic 48'}))
  fireEvent.click(screen.getByRole('button',{name:'Подтвердить удаление'}))
  await waitFor(()=>{expect(deletePhoto).toHaveBeenCalled()})
  await screen.findByRole('img',{name:'Synthetic 42'})
  expect(screen.getByRole('button',{name:'Следующие фото'})).toBeDisabled()
  vi.mocked(listPhotos).mockResolvedValue(photos.slice(0,49))
  act(() => { invalidateQueries() })
  await waitFor(()=>{expect(screen.getByRole('button',{name:'Следующие фото'})).toBeEnabled()})
  expect(screen.getByRole('img',{name:'Synthetic 42'})).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'Предыдущие фото'}))
  await screen.findByRole('img',{name:'Synthetic 36'})
  expect(screen.getAllByRole('img').length).toBeLessThanOrEqual(6)
})

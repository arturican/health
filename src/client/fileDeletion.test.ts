// @vitest-environment node
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { clientApi } from '../../tests/clientApi'
import { registerFiles } from '../server/fileRecords'
import { registerPhotos } from '../server/photoRoutes'
import { registerDocuments } from '../server/documentRoutes'
import { createUploadTransport } from '../server/uploadTransport'
import { deletePhoto, listPhotos } from './photoRepository'
import { addDocument, deleteDocument, deleteDocumentWithResults } from './documentRepository'
import { getFile, subscribeFileDeletion } from './fileRepository'
const setup=()=>clientApi((app,pool,authorize,clock)=>{
  const uploads=createUploadTransport(app,authorize)
  registerFiles(app,pool,authorize);registerPhotos(app,pool,authorize,uploads,clock);registerDocuments(app,pool,authorize,uploads,clock)
})
it('photo409 не очищает файл, подтверждённый DELETE уведомляет только свой fileId',async()=>{
  const api=await setup(),events:string[]=[]
  const unsubscribe=subscribeFileDeletion(event=>{events.push(event.fileId)})
  try{
    const bytes=await sharp({create:{width:2,height:3,channels:3,background:'#376890'}}).jpeg().toBuffer()
    const id=randomUUID(),file=randomUUID()
    await api.database.pool.query("INSERT INTO health.files(user_id,id,purpose,mime,size,bytes) VALUES ($1,$2,'photo','image/jpeg',$3,$4)",[api.alice.id,file,bytes.length,bytes])
    await api.database.pool.query("INSERT INTO health.photos(user_id,id,file_id,date,title,note,width,height) VALUES ($1,$2,$3,'2026-10-15','Synthetic','',2,3)",[api.alice.id,id,file])
    const original=(await listPhotos())[0]
    if(!original) throw new Error('No photo')
    await api.database.pool.query('UPDATE health.photos SET revision=2 WHERE id=$1',[id])
    await expect(deletePhoto(original)).rejects.toMatchObject({status:409})
    expect(events).toEqual([])
    const fresh=(await listPhotos())[0]
    if(!fresh) throw new Error('No fresh photo')
    await deletePhoto(fresh)
    expect(events).toEqual([file])
    expect(await getFile(file)).toBeNull()
  }finally{unsubscribe();await api.close()}
})
it.each(['plain','count'] as const)('document %s delete уведомляет после успеха',async mode=>{
  const api=await setup(),events:string[]=[]
  const unsubscribe=subscribeFileDeletion(event=>{events.push(event.fileId)})
  try{
    const original=await addDocument({date:'2026-10-15',title:'Synthetic',kind:'other',note:''},new Blob(['%PDF-1.7\nsynthetic\n%%EOF\n'],{type:'application/pdf'}))
    if(mode==='plain') await deleteDocument(original)
    else await deleteDocumentWithResults(original,0)
    expect(events).toEqual([original.fileId])
    expect(await getFile(original.fileId)).toBeNull()
  }finally{unsubscribe();await api.close()}
})
it('подтверждение прежнего owner после смены сессии не уведомляет нового',async()=>{
  const api=await setup(),events:string[]=[]
  const unsubscribe=subscribeFileDeletion(event=>{events.push(event.fileId)})
  try{
    const original=await addDocument({date:'2026-10-15',title:'Synthetic',kind:'other',note:''},new Blob(['%PDF-1.7\nsynthetic\n%%EOF\n'],{type:'application/pdf'}))
    const transport=api.network.getMockImplementation()
    if(!transport) throw new Error('No transport')
    let entered:()=>void=()=>{throw new Error('not ready')},release:()=>void=()=>{throw new Error('not ready')}
    const ready=new Promise<void>(done=>{entered=done}),waiting=new Promise<void>(done=>{release=done})
    api.network.mockImplementationOnce(async(...args)=>{const response=await transport(...args);entered();await waiting;return response})
    const pending=deleteDocument(original)
    const rejected=expect(pending).rejects.toThrow()
    await ready
    await api.signIn('bob')
    release()
    await rejected
    expect(events).toEqual([])
  }finally{unsubscribe();await api.close()}
})

import { randomBytes, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { expect, test } from './fixtures'
import { createPool } from '../../src/server/database'

test('файлы галереи: вход, focus и правка метаданных', async ({ page, account }) => {
  const value=process.env['HEALTH_E2E_ADMIN_URL']
  if(!value) throw new Error('Нет изолированной E2E БД')
  const url=new URL(value)
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!/^\/health_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error('Не тестовая БД')
  const admin=createPool(value)
  const jpeg=await sharp(randomBytes(1600*1200*3),{raw:{width:1600,height:1200,channels:3}}).jpeg({quality:90}).toBuffer()
  expect(jpeg.length).toBeLessThanOrEqual(2*1024*1024)
  const transfers:{bytes:number}[]=[]
  const failures:string[]=[]
  page.on('pageerror',error=>{failures.push(error.message)})
  page.on('response',response=>{
    if(new URL(response.url()).pathname.startsWith('/api/v1/files/')){
      expect(response.status()).toBe(200)
      transfers.push({bytes:Number(response.headers()['content-length'])})
    }
  })
  try{
    for(let index=0;index<6;index++){
      const file=randomUUID()
      await admin.query("INSERT INTO health.files(user_id,id,purpose,mime,size,bytes) VALUES ($1,$2,'photo','image/jpeg',$3,$4)",[account.id,file,jpeg.length,jpeg])
      await admin.query("INSERT INTO health.photos(user_id,id,file_id,date,title,note,width,height) VALUES ($1,$2,$3,'2026-10-14',$4,'',1600,1200)",[account.id,randomUUID(),file,'Synthetic '+String(index)])
    }
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
    await page.goto('/#photos')
    const gallery=page.getByRole('region',{name:'Галерея фото',exact:true})
    async function settle(phase:string){
      await expect(gallery.getByRole('img')).toHaveCount(6)
      await page.waitForLoadState('networkidle')
      console.log(JSON.stringify({phase,fileGET:transfers.length,bytes:transfers.reduce((sum,row)=>sum+row.bytes,0),oneJPEG:jpeg.length}))
      expect(transfers.length).toBe(phase === 'initial' ? 6 : 0)
      expect(transfers.every(row=>row.bytes===jpeg.length)).toBe(true)
      transfers.length=0
    }
    await settle('initial')
    const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/photos')
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'))})
    await refreshed
    await settle('focus')
    await gallery.getByRole('button',{name:/Изменить фото \d+: Synthetic 0/}).click()
    const editor=page.getByRole('form',{name:'Редактирование фото',exact:true})
    await editor.getByLabel('Подпись фото',{exact:true}).fill('Synthetic updated')
    await editor.getByRole('button',{name:'Сохранить фото',exact:true}).click()
    await expect(gallery.getByRole('heading',{name:'Synthetic updated',exact:true})).toBeVisible()
    await settle('metadata')
    expect(failures).toEqual([])
  }finally{await admin.end()}
})

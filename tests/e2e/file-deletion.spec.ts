import sharp from 'sharp'
import { expect, test } from './fixtures'

test('DELETE очищает Blob при failed metadata, соседний файл остаётся',async({page})=>{
  const failures:string[]=[]
  page.on('pageerror',error=>{failures.push(error.message)})
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  const jpeg=await sharp({create:{width:32,height:16,channels:3,background:'#376890'}}).jpeg().toBuffer()
  await page.goto('/#photos')
  const form=page.getByRole('form',{name:'Добавление фото',exact:true})
  const gallery=page.getByRole('region',{name:'Галерея фото',exact:true})
  for(const title of ['Synthetic first','Synthetic neighbour']){
    await form.getByLabel('Подпись фото',{exact:true}).fill(title)
    await form.getByLabel('Файл фото',{exact:true}).setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:jpeg})
    await form.getByRole('button',{name:'Добавить фото',exact:true}).click()
    await expect(gallery.getByRole('img',{name:title,exact:true})).toBeVisible()
  }
  const neighbour=gallery.getByRole('img',{name:'Synthetic neighbour',exact:true})
  const previous=await neighbour.getAttribute('src')
  let fileGET=0
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/v1/files/')) fileGET++})
  await page.route('**/api/v1/photos?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}))
  await gallery.getByRole('button',{name:/Удалить фото \d+: Synthetic first/}).click()
  await page.getByRole('button',{name:'Подтвердить удаление',exact:true}).click()
  await expect(page.getByText('Фото удалено',{exact:true})).toBeVisible()
  await expect(gallery.getByRole('heading',{name:'Synthetic first',exact:true})).toBeVisible()
  await expect(gallery.getByRole('img',{name:'Synthetic first',exact:true})).toHaveCount(0)
  await expect(gallery.getByRole('alert')).toContainText('Не удалось открыть файл')
  await expect(neighbour).toHaveAttribute('src',previous ?? '')
  expect(fileGET).toBe(0)
  await page.unroute('**/api/v1/photos?*')
  await page.getByRole('button',{name:'Повторить загрузку',exact:true}).click()
  await expect(gallery.getByRole('heading',{name:'Synthetic first',exact:true})).toHaveCount(0)
  await expect(neighbour).toHaveAttribute('src',previous ?? '')
  expect(failures).toEqual([])
})

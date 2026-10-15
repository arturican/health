import sharp from 'sharp'
import { readFullBackup, type FullBackup } from '../domain/fullBackup'
import { demoText, demoDate } from './demoText.js'
import { demoId } from './demoProducts.js'
import { demoPdf } from './demoPdf.js'

export async function demoBackup(today: string): Promise<FullBackup> {
  const backup: FullBackup = { format: 'health-diary-full', version: 1, text: demoText(today),
    metadata: [{ id: 'catalog-seeded', value: 'done' }, { id: 'demo-seed-v1', value: today }],
    photos: [], documents: [], files: [], labResults: [] }
  for (const [index, daysAgo] of [89, 44, 0].entries()) {
    const date = demoDate(today, daysAgo), photoId = demoId(4000 + index * 10), documentId = demoId(5000 + index * 10)
    const photoFile = demoId(4001 + index * 10), documentFile = demoId(5001 + index * 10)
    const jpeg = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720">
      <rect width="960" height="720" fill="#e6eef3"/><rect x="110" y="120" width="270" height="480" rx="45" fill="#458479"/>
      <circle cx="650" cy="360" r="${String(130 + index * 15)}" fill="#c78f63"/></svg>`)).jpeg({ quality: 85 }).toBuffer()
    const hemoglobin = 145 - index, glucose = index === 1 ? 5.1 : 4.9
    const pdf = demoPdf(date, hemoglobin, glucose)
    backup.photos.push({ id: photoId, fileId: photoFile, date, title: `Учебная композиция ${String(index + 1)}`,
      note: 'Геометрические фигуры для проверки сравнения по датам. Это не фотография человека.', width: 960, height: 720 })
    backup.documents.push({ id: documentId, fileId: documentFile, date, title: `Учебный лабораторный бланк · ${date}`,
      kind: 'lab', note: 'Все значения вымышлены. Бланк на английском, показатели введены вручную.' })
    backup.files.push({ id: photoFile, purpose: 'photo', mime: 'image/jpeg', size: jpeg.length, base64: jpeg.toString('base64') },
      { id: documentFile, purpose: 'document', mime: 'application/pdf', size: pdf.length, base64: pdf.toString('base64') })
    const common = { documentId, date, reference: 'Учебный бланк без медицинских референсов', note: 'Синтетические данные' }
    backup.labResults.push({ ...common, id: demoId(6000 + index * 10), name: 'Гемоглобин', unit: 'г/л', value: { type: 'number', number: hemoglobin, operator: 'eq' } },
      { ...common, id: demoId(6001 + index * 10), name: 'Глюкоза', unit: 'ммоль/л', value: { type: 'number', number: glucose, operator: 'eq' } },
      { ...common, id: demoId(6002 + index * 10), name: 'Качественный учебный показатель', unit: '', value: { type: 'text', text: 'Не обнаружено' } })
  }
  return readFullBackup(backup, today)
}

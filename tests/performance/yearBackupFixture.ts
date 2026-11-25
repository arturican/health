import sharp from 'sharp'
import { readFullBackup, type FullBackup } from '../../src/domain/fullBackup'
import { demoText, demoDate } from '../../src/server/demoText'
import { demoId } from '../../src/server/demoProducts'
import { demoPdf } from '../../src/server/demoPdf'

export const YEAR_TODAY = '2026-10-14'
const MiB = 1024 * 1024

// JPEG COM segments preserve image decoding and put the synthetic payload inside the file.
function sizedJpeg(jpeg: Buffer, size: number, index: number) {
  const segments: Buffer[] = [jpeg.subarray(0, -2)]
  let remaining = size - jpeg.length
  while (remaining > 0) {
    let length = Math.min(remaining, 65537)
    if (remaining - length > 0 && remaining - length < 4) length -= 4
    const segment = Buffer.alloc(length, 65 + index % 26)
    segment[0] = 255
    segment[1] = 254
    segment.writeUInt16BE(length - 2, 2)
    segments.push(segment)
    remaining -= length
  }
  return Buffer.concat([...segments, jpeg.subarray(-2)])
}

export async function yearBackupFixture(): Promise<FullBackup> {
  const start = demoDate(YEAR_TODAY, 364)
  const template = demoText(demoDate(start, -89))
  const dates = Array.from({ length: 365 }, (_, index) => demoDate(YEAR_TODAY, 364 - index))
  const text = { ...template, exportedAt: YEAR_TODAY + 'T12:00:00.000Z',
    weights: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [] } satisfies FullBackup['text']
  const weights: FullBackup['text']['weights'] = []
  const foodEntries: FullBackup['text']['foodEntries'] = []
  const nutritionDays: FullBackup['text']['nutritionDays'] = []
  const steps: FullBackup['text']['steps'] = []
  const workouts: FullBackup['text']['workouts'] = []
  const menu = template.foodEntries.filter(row => row.date === start)
  const workout = template.workouts[0]
  if (!workout || menu.length !== 13) throw new Error('Неполный шаблон года')
  dates.forEach((date, index) => {
    if (index % 3 === 0 || index === 364) {
      weights.push({ id: demoId(1000 + index), date, kg: 80 + index % 10 / 10 })
    }
    if (index % 19 !== 5) {
      const complete = index % 13 !== 4 && index !== 364
      nutritionDays.push({ date, complete })
      menu.forEach((entry, portion) => {
        if (complete || entry.meal !== 'dinner') {
          foodEntries.push({ ...entry, id: demoId(10000 + index * 20 + portion), date })
        }
      })
    }
    if (index % 17 !== 6) steps.push({ date, count: index === 17 ? 0 : 4800 + index })
    if (index % 3 === 1) workouts.push({ ...workout, id: demoId(2000 + index), date })
  })
  text.energyPlans = template.energyPlans.map(plan => {
    const weight = weights.find(row => row.date === plan.effectiveFrom)
    if (!weight) throw new Error('Нет веса плана')
    return { ...plan, snapshot: { ...plan.snapshot, kg: weight.kg } }
  })
  const backup: FullBackup = { format: 'health-diary-full', version: 1,
    text: { ...text, weights, foodEntries, nutritionDays, steps, workouts },
    metadata: [{ id: 'section-visibility', value: JSON.stringify({ version: 1, showPhotos: false, showDocuments: false }) }],
    files: [], photos: [], documents: [], labResults: [] }
  for (let index = 0; index < 52; index++) {
    const id = demoId(30000 + index), fileId = demoId(31000 + index)
    const jpeg = await sharp({ create: { width: 960, height: 720, channels: 3,
      background: { r: 30 + index * 3, g: 110, b: 160 } } }).jpeg({ quality: 85 }).toBuffer()
    const bytes = sizedJpeg(jpeg, MiB, index)
    backup.photos.push({ id, fileId, date: dates[index * 7] ?? start, title: 'Учебная геометрия ' + String(index),
      note: 'Синтетические пиксели', width: 960, height: 720 })
    backup.files.push({ id: fileId, purpose: 'photo', mime: 'image/jpeg', size: bytes.length, base64: bytes.toString('base64') })
  }
  for (let index = 0; index < 24; index++) {
    const id = demoId(32000 + index), fileId = demoId(33000 + index), date = dates[index * 15] ?? start
    const original = demoPdf(date, 145, 4.9)
    const end = Buffer.from('%%EOF\n')
    const bytes = Buffer.concat([original.subarray(0, -end.length),
      Buffer.from('%'), Buffer.alloc(2 * MiB - original.length - 2, 65 + index), Buffer.from('\n'), end])
    backup.documents.push({ id, fileId, date, title: 'Учебный PDF ' + String(index), kind: 'lab', note: '' })
    backup.files.push({ id: fileId, purpose: 'document', mime: 'application/pdf', size: bytes.length, base64: bytes.toString('base64') })
    for (let item = 0; item < 3; item++) backup.labResults.push({
      id: demoId(34000 + index * 3 + item), documentId: id, date, name: 'Учебный показатель ' + String(item),
      value: { type: 'number', number: item, operator: 'eq' }, unit: '', reference: '', note: '',
    })
  }
  return readFullBackup(backup, YEAR_TODAY)
}

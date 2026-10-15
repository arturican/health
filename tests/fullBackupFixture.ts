import sharp from 'sharp'
import type { FullBackup } from '../src/domain/fullBackup'
import { textBackupFixture } from './textBackupFixture'

export async function fullBackupFixture(): Promise<FullBackup> {
  const id = (index: number) => `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  const jpeg = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#376890' } }).jpeg().toBuffer()
  const pdf = Buffer.from('%PDF-1.7\n% Synthetic report only\n%%EOF\n')
  return {
    format: 'health-diary-full', version: 1, text: textBackupFixture(),
    metadata: [{ id: 'catalog-seeded', value: 'done' },
      { id: 'section-visibility', value: JSON.stringify({ version: 1, showPhotos: false, showDocuments: false }) },
      { id: 'synthetic-legacy', value: 'Учебные метаданные 🧪' }, { id: 'diary-generation', value: id(10) }],
    photos: [{ id: id(1), fileId: id(3), date: '2026-10-15', title: 'Учебная геометрия', note: '', width: 2, height: 3 }],
    documents: [{ id: id(2), fileId: id(4), date: '2026-10-15', title: 'Учебный бланк', kind: 'lab', note: '' }],
    labResults: [{ id: id(5), documentId: id(2), date: '2026-10-15', name: 'Учебный показатель', value: { type: 'number', number: -0.25, operator: 'lte' }, unit: '', reference: 'Как на бланке', note: '' },
      { id: id(6), documentId: id(2), date: '2026-10-15', name: 'Учебный текст', value: { type: 'text', text: 'Не обнаружено' }, unit: '', reference: '', note: '' }],
    files: [{ id: id(3), purpose: 'photo', mime: 'image/jpeg', size: jpeg.length, base64: jpeg.toString('base64') },
      { id: id(4), purpose: 'document', mime: 'application/pdf', size: pdf.length, base64: pdf.toString('base64') }],
  }
}

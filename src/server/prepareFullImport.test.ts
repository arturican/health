// @vitest-environment node
import { expect, it } from 'vitest'
import { fullBackupFixture } from '../../tests/fullBackupFixture'
import { prepareFullImport } from './prepareFullImport'

it('подготавливает исходные байты и размеры без изменения входной копии', async () => {
  const backup = await fullBackupFixture()
  const original = structuredClone(backup)
  const result = await prepareFullImport(backup, '2026-10-15')
  expect(result.backup).toEqual(original)
  expect(backup).toEqual(original)
  expect(result.files.map(record => record.file.bytes.toString('base64'))).toEqual(backup.files.map(file => file.base64))
  expect(result.files.map(record => record.file.dimensions)).toEqual([{ width: 2, height: 3 }, null])
})

it('отклоняет подмену размеров, повреждённые байты и превышение размера до записи', async () => {
  const backup = await fullBackupFixture()
  for (const patch of [
    { photos: backup.photos.map(photo => ({ ...photo, width: 3 })) },
    { files: backup.files.map(file => ({ ...file, size: file.size + 1 })) },
    { files: backup.files.map(file => ({ ...file, base64: Buffer.alloc(file.size, 1).toString('base64') })) },
    { files: backup.files.map(file => ({ ...file, size: 20971521 })) },
  ]) await expect(prepareFullImport({ ...backup, ...patch }, '2026-10-15')).rejects.toMatchObject({ statusCode: 400 })
})

it('не принимает чужие поля, потерянные источники, будущие даты и повреждённые пиксели JPEG', async () => {
  const backup = await fullBackupFixture()
  for (const patch of [
    { user_id: 'ignored-owner' }, { documents: [] }, { files: [] },
    { photos: backup.photos.map(photo => ({ ...photo, date: '2026-10-16' })) },
    { files: backup.files.map(file => {
      if (file.purpose !== 'photo') return file
      const bytes = Buffer.from(file.base64, 'base64')
      const truncated = Buffer.concat([bytes.subarray(0, Math.floor(bytes.length / 2)), Buffer.from([255, 217])])
      return { ...file, size: truncated.length, base64: truncated.toString('base64') }
    }) },
  ]) await expect(prepareFullImport({ ...backup, ...patch }, '2026-10-15')).rejects.toMatchObject({ statusCode: 400 })
})

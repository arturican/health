// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { clientApi } from '../../tests/clientApi'
import { registerProfile } from '../server/profileRoutes'
import { registerFiles } from '../server/fileRecords'
import { registerDocuments } from '../server/documentRoutes'
import { registerBackups } from '../server/backupRoutes'
import { registerClear } from '../server/clearRoutes'
import { createUploadTransport } from '../server/uploadTransport'
import { createProfile, getProfile, updateProfile } from './profileRepository'
import { addDocument, listDocuments } from './documentRepository'
import { getFile } from './fileRepository'
import { getVisibility, saveVisibility } from './visibilityRepository'
import { prepareDiaryChange } from './confirmations'
import { clearDiary, exportFullBackup, exportTextBackup, restoreFullBackup, restoreTextBackup } from './backupRepository'
import { getClientSession } from './session'
import { getNotice } from './notices'

let api: Awaited<ReturnType<typeof clientApi>>
const profile = { id: 'self', name: 'Учебный профиль', heightCm: 178, birthDate: null, formulaSex: 'none' }
beforeEach(async () => {
  api = await clientApi((app, pool, authorize, clock) => {
    registerProfile(app, pool, authorize, clock); registerFiles(app, pool, authorize)
    registerDocuments(app, pool, authorize, createUploadTransport(app, authorize), clock)
    registerBackups(app, pool, authorize, clock); registerClear(app, pool, authorize)
  })
})
afterEach(async () => { await api.close() })
const create = () => createProfile(profile, { id: randomUUID(), date: '2026-10-15', kg: 75 })

it('настройки сохраняются с исходной версией и не перезаписываются старой формой', async () => {
  const original = await getVisibility()
  await saveVisibility({ ...original, showPhotos: false }, original)
  expect(await getVisibility()).toEqual({ ...original, showPhotos: false })
  await expect(saveVisibility({ ...original, showDocuments: false }, original)).rejects.toMatchObject({ status: 409 })
})

it('текстовая копия требует свежего подтверждения и инвалидирует прежние редакторы', async () => {
  await create()
  const backup = await exportTextBackup(), confirmation = await prepareDiaryChange(), original = await getProfile()
  if (!original) throw new Error('Нет профиля')
  await updateProfile({ ...original, name: 'Правка после подтверждения' }, original)
  await expect(restoreTextBackup(backup, confirmation)).rejects.toMatchObject({ status: 409 })
  expect((await getProfile())?.name).toBe('Правка после подтверждения')
  await restoreTextBackup(backup, await prepareDiaryChange())
  expect(await getProfile()).toEqual(profile)
  expect(getNotice()).toBe('Текстовая копия восстановлена')
  await expect(updateProfile({ ...original, name: 'Старый редактор' }, original)).rejects.toMatchObject({ status: 409 })
})

it('полная копия возвращает PDF и флаги после очистки; аккаунт и вход сохраняются', async () => {
  await create()
  const file = new Blob(['%PDF-1.7\n% Synthetic backup\n%%EOF\n'], { type: 'application/pdf' })
  const document = await addDocument({ date: '2026-10-15', title: 'Учебный PDF', kind: 'other', note: '' }, file)
  const visibility = await getVisibility()
  await saveVisibility({ ...visibility, showDocuments: false }, visibility)
  const backup = await exportFullBackup(), account = getClientSession().session?.account
  await clearDiary(await prepareDiaryChange())
  expect(getClientSession().session?.account).toEqual(account)
  expect(await getProfile()).toBeNull()
  expect((await exportFullBackup()).files).toEqual([])
  expect(getNotice()).toBe('Все данные дневника удалены')
  await restoreFullBackup(backup, await prepareDiaryChange())
  expect(await listDocuments()).toEqual([document])
  expect(await (await getFile(document.fileId))?.blob.text()).toBe(await file.text())
  expect((await getVisibility()).showDocuments).toBe(false)
  expect(getNotice()).toBe('Полная копия восстановлена')
  await api.signIn('bob')
  expect(getNotice()).toBeNull()
  expect((await exportFullBackup()).files).toEqual([])
})

it('повтор очистки после потерянного ответа получает прежний результат без новой команды', async () => {
  await create()
  const confirmation = await prepareDiaryChange(), transport = api.network.getMockImplementation()
  if (!transport) throw new Error('Нет транспорта')
  api.network.mockImplementationOnce(async (...args) => { await transport(...args); throw new Error('Ответ потерян') })
  await expect(clearDiary(confirmation)).rejects.toThrow()
  await clearDiary(confirmation)
  expect(await getProfile()).toBeNull()
  expect((await api.database.pool.query('SELECT count(*)::text AS count FROM health.commands')).rows).toEqual([{ count: '1' }])
  expect((await api.database.pool.query('SELECT count(*)::text AS count FROM health.users')).rows).toEqual([{ count: '2' }])
  await expect(clearDiary(confirmation)).rejects.toMatchObject({ status: 409 })
})

// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { clientApi } from '../../tests/clientApi'
import { registerFiles, insertFile } from '../server/fileRecords'
import { validateServerAttachment } from '../server/attachmentValidation'
import { withUser } from '../server/userTransaction'
import { setClientSession } from './session'
import { getFile } from './fileRepository'

let api: Awaited<ReturnType<typeof clientApi>>
const bytes = Buffer.from('%PDF-1.7\n% Synthetic bytes only\n%%EOF\n')
beforeEach(async () => { api = await clientApi((app, pool, authorize) => { registerFiles(app, pool, authorize) }) })
afterEach(async () => { await api.close() })

it('сохраняет исходные байты и метаданные; чужой аккаунт и анонимный клиент не читают файл', async () => {
  const id = randomUUID(), validated = await validateServerAttachment(bytes, 'document', 'application/pdf')
  await withUser(api.database.runtime, api.alice, client => insertFile(client, api.alice.id, id, validated), true)
  const file = await getFile(id)
  if (!file) throw new Error('Файл не найден')
  expect(file).toMatchObject({ id, purpose: 'document', mime: 'application/pdf', size: bytes.length })
  expect(Buffer.from(await file.blob.arrayBuffer())).toEqual(bytes)
  expect(await getFile(randomUUID())).toBeNull()
  await api.signIn('bob')
  expect(await getFile(id)).toBeNull()
  setClientSession(null)
  await expect(getFile(id)).rejects.toMatchObject({ status: 401 })
})

it('отклоняет повреждённое тело и неверное назначение успешного ответа', async () => {
  const headers = { 'X-Account-Id': api.alice.id, 'Content-Type': 'application/pdf', 'X-File-Purpose': 'document' }
  api.network.mockResolvedValueOnce(new Response('broken', { headers }))
  await expect(getFile(randomUUID())).rejects.toThrow('Не удалось получить данные')
  api.network.mockResolvedValueOnce(new Response(bytes, { headers: { ...headers, 'X-File-Purpose': 'photo' } }))
  await expect(getFile(randomUUID())).rejects.toThrow('Не удалось получить данные')
})

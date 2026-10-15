import type { z } from 'zod'
import { encodeBase64 } from '../domain/base64'
import { readStoredFile, type StoredFile } from '../domain/storedFile'
import { executeCommand } from './commands'
import { requestApi } from './http'
import { assertContext, captureContext } from './records'

export async function uploadRecord<T>(kind: 'photos' | 'documents', metadata: Record<string, unknown>, input: StoredFile,
  schema: z.ZodType<T>, context: ReturnType<typeof captureContext>) {
  assertContext(context)
  const file = readStoredFile(input)
  if (file.purpose !== (kind === 'photos' ? 'photo' : 'document')) throw new Error('Неверное назначение файла')
  const hash = await crypto.subtle.digest('SHA-256', await file.blob.arrayBuffer())
  assertContext(context)
  const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
  return executeCommand(`upload ${kind}`, { metadata, mime: file.mime, sha256 }, schema, command => {
    const record = { ...metadata, id: command.id, fileId: file.id, mime: file.mime }
    const encoded = encodeBase64(new TextEncoder().encode(JSON.stringify(record))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
    return requestApi(`/api/v1/${kind}`, async response => {
      const value: unknown = await response.json()
      return value
    }, { method: 'POST', body: file.blob, headers: { ...command.headers, 'Content-Type': 'application/octet-stream', 'X-Record': encoded } })
  }, context)
}

import { createHash } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { entityId } from '../domain/schema'
import { readChangeRevision } from './diaryState.js'
import { inputValue } from './httpErrors.js'

export function readImportHeaders(request: FastifyRequest) {
  return inputValue(() => {
    entityId.parse(request.headers['idempotency-key'])
    entityId.parse(request.headers['x-diary-generation'])
    readChangeRevision(request.headers['x-diary-revision'])
    return z.enum(['empty', 'replace']).default('empty').parse(request.headers['x-import-mode'])
  })
}

export function readImportBody(body: unknown) {
  return inputValue(() => {
    if (!Buffer.isBuffer(body)) throw new Error('Ожидается JSON в бинарном теле')
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
    return { value, sha256: createHash('sha256').update(body).digest('hex') }
  })
}

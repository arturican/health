import { createHash } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { inputValue } from './httpErrors.js'
import { requireConfirmation } from './writeCommand.js'

export function readImportHeaders(request: FastifyRequest) {
  requireConfirmation(request)
  return inputValue(() => {
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

import { z } from 'zod'
import { readTextBackup, serializeTextBackup } from '../domain/backup'
import { readFullBackup, serializeFullBackup } from '../domain/fullBackup'
import { ApiError, requestApi, requestJSON } from './http'
import { executeCommand } from './commands'
import type { DiaryConfirmation } from './confirmations'
import { assertContext } from './records'
import { diaryStateSchema, updateDiaryState } from './session'
import { setNotice } from './notices'

async function exportBackup<T>(format: 'text' | 'full', schema: z.ZodType<T>): Promise<T> {
  try { return await requestJSON('/api/v1/backup/' + format, schema) }
  catch (error: unknown) {
    if (error instanceof ApiError && error.status === 413) throw new Error(format === 'text'
      ? 'Текстовая копия превышает 20 MiB. Попробуйте «Скачать полную копию» в настройках; её предел — 200 MiB. Данные не изменены.'
      : 'Полная копия превышает 200 MiB. Данные не изменены. Обратитесь к администратору для проверки серверной резервной копии и безопасного сохранения ваших данных.')
    throw error
  }
}
export const exportTextBackup = () => exportBackup('text', z.unknown().transform(value => readTextBackup(value)))
export const exportFullBackup = () => exportBackup('full', z.unknown().transform(value => readFullBackup(value)))

async function replaceDiary(path: string, body: string, confirmation: DiaryConfirmation, message: string, clear = false) {
  assertContext(confirmation.context)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  const sha256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
  const schema = diaryStateSchema.transform(state => {
    updateDiaryState(state)
    setNotice(message)
    return null
  })
  await executeCommand(path, { sha256, changeRevision: confirmation.changeRevision }, schema, async command => {
    const response = await requestApi(path, async result => {
      const value: unknown = await result.json()
      return z.strictObject({ generation: z.uuid() }).parse(value)
    }, {
      method: clear ? 'DELETE' : 'POST', headers: { ...command.headers, 'X-Diary-Revision': String(confirmation.changeRevision),
        'Content-Type': clear ? 'application/json' : 'application/vnd.health-diary+json', ...(clear ? {} : { 'X-Import-Mode': 'replace' }) }, body,
    })
    const state = await requestJSON('/api/v1/diary-state', diaryStateSchema)
    if (state.generation !== response.generation) throw new ApiError(409)
    return state
  }, confirmation.context)
}
export const restoreTextBackup = (input: unknown, confirmation: DiaryConfirmation) => replaceDiary('/api/v1/backup/text', serializeTextBackup(input), confirmation, 'Текстовая копия восстановлена')
export const restoreFullBackup = (input: unknown, confirmation: DiaryConfirmation) => replaceDiary('/api/v1/backup/full', serializeFullBackup(input), confirmation, 'Полная копия восстановлена')
export const clearDiary = (confirmation: DiaryConfirmation) => replaceDiary('/api/v1/diary', '{"confirm":"delete-diary"}', confirmation, 'Все данные дневника удалены', true)

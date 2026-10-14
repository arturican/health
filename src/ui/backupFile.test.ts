import { expect, it, vi } from 'vitest'
import { readBackupFile } from './backupFile'
import { TEXT_BACKUP_MAX_BYTES } from '../domain/backup'

const empty = { format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T00:00:00.000Z', profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [] }
function file(bytes: Uint8Array) {
  const result = new File(['x'], 'synthetic.json', { type: 'application/json' })
  const read = vi.fn().mockResolvedValue(bytes.buffer)
  Object.defineProperty(result, 'size', { value: bytes.byteLength, configurable: true })
  Object.defineProperty(result, 'arrayBuffer', { value: read })
  return { result, read }
}

it('читает UTF-8 JSON и возвращает полностью проверенные данные', async () => {
  expect(await readBackupFile(file(new TextEncoder().encode(JSON.stringify(empty))).result)).toEqual(empty)
})

it('не читает пустой или превышающий лимит файл', async () => {
  for (const size of [0, TEXT_BACKUP_MAX_BYTES + 1]) {
    const { result, read } = file(new Uint8Array([1]))
    Object.defineProperty(result, 'size', { value: size })
    await expect(readBackupFile(result)).rejects.toThrow(size ? /20 MiB/ : /пуст/)
    expect(read).not.toHaveBeenCalled()
  }
})

it('не раскрывает содержимое испорченного JSON и отвергает неверную кодировку и версию', async () => {
  for (const bytes of [new TextEncoder().encode('Личная синтетическая строка'), new Uint8Array([255, 254])]) {
    await expect(readBackupFile(file(bytes).result)).rejects.toThrow('Не удалось прочитать JSON в кодировке UTF-8')
  }
  await expect(readBackupFile(file(new TextEncoder().encode(JSON.stringify({ ...empty, version: 2 }))).result)).rejects.toThrow()
})

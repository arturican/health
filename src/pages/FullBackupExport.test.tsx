import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FullBackupExport } from './FullBackupExport'
import { exportFullBackup } from '../data/fullBackupRepository'
import { downloadBlob } from '../ui/download'
import { readFullBackup, type FullBackup } from '../domain/fullBackup'

vi.mock('../data/fullBackupRepository', () => ({ exportFullBackup: vi.fn() }))
vi.mock('../ui/download', () => ({ downloadBlob: vi.fn() }))
function empty(): FullBackup {
  return { format: 'health-diary-full', version: 1, text: { format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00Z', profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] }, metadata: [], photos: [], documents: [], labResults: [], files: [] }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 14, 12))
  vi.mocked(exportFullBackup).mockReset().mockResolvedValue(empty())
  vi.mocked(downloadBlob).mockReset()
})
afterEach(() => { vi.useRealTimers() })

it('по явной кнопке скачивает проверенный полный JSON и объясняет содержание/пределы', async () => {
  render(<FullBackupExport />)
  expect(screen.getByText(/ручные показатели и настройки/)).toHaveTextContent('200 MiB')
  expect(screen.getByText(/не зашифрована/)).toBeVisible()
  expect(exportFullBackup).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Скачать полную копию' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Полная копия подготовлена')
  const blob = vi.mocked(downloadBlob).mock.calls[0]?.[0]
  if (!blob) throw new Error('JSON должен быть подготовлен')
  const contents = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Копия должна читаться как текст'))
    }, { once: true })
    reader.addEventListener('error', () => { reject(new Error('Не удалось прочитать копию')) }, { once: true })
    reader.readAsText(blob)
  })
  const parsed: unknown = JSON.parse(contents)
  expect(readFullBackup(parsed)).toEqual(empty())
  expect(downloadBlob).toHaveBeenCalledWith(blob, 'health-diary-full-2026-10-14.json')
})

it('блокирует повторный экспорт, затем показывает безопасную ошибку и допускает повтор', async () => {
  let rejectExport: ((reason: Error) => void) | undefined
  vi.mocked(exportFullBackup).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectExport = reject }))
  render(<FullBackupExport />)
  fireEvent.click(screen.getByRole('button', { name: 'Скачать полную копию' }))
  const pending = await screen.findByRole('button', { name: 'Готовим полную копию…' })
  expect(pending).toBeDisabled()
  fireEvent.click(pending)
  expect(exportFullBackup).toHaveBeenCalledTimes(1)
  rejectExport?.(Object.assign(new Error('private'), { name: 'QuotaExceededError' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.queryByText('private')).not.toBeInTheDocument()
  expect(downloadBlob).not.toHaveBeenCalled()
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Скачать полную копию' })).toBeEnabled() })
  fireEvent.click(screen.getByRole('button', { name: 'Скачать полную копию' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Полная копия подготовлена')
  expect(downloadBlob).toHaveBeenCalledTimes(1)
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { restoreTextBackup } from '../data/backupRepository'
import { readBackupFile } from '../ui/backupFile'

vi.mock('../data/backupRepository', () => ({ exportTextBackup: vi.fn(), restoreTextBackup: vi.fn() }))
vi.mock('../ui/backupFile', () => ({ readBackupFile: vi.fn() }))
const backup = { format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00Z', profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [] }

beforeEach(() => { vi.resetAllMocks() })

it('сохраняет предпросмотр при ошибке записи, позволяет повторить и сбрасывает согласие нового файла', async () => {
  vi.mocked(readBackupFile).mockResolvedValue({ ...backup, format: 'health-diary-text', version: 1 })
  vi.mocked(restoreTextBackup).mockRejectedValueOnce(Object.assign(new Error('synthetic-private-storage-details'), { name: 'QuotaExceededError' })).mockResolvedValue(undefined)
  render(<SettingsPage />)
  const file = screen.getByLabelText('Файл текстовой копии')
  fireEvent.change(file, { target: { files: [new File(['{}'], 'synthetic.json')] } })
  fireEvent.submit(screen.getByRole('form', { name: 'Импорт текстовой копии' }))
  const restore = await screen.findByRole('button', { name: 'Восстановить текстовую копию' })
  expect(restore).toBeDisabled()
  fireEvent.click(screen.getByLabelText('Согласен заменить текстовые данные дневника'))
  fireEvent.click(restore)
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('alert')).not.toHaveTextContent('synthetic-private-storage-details')
  expect(screen.getByRole('region', { name: 'Предпросмотр текстовой копии' })).toBeVisible()
  await waitFor(() => { expect(restore).toBeEnabled() })
  fireEvent.click(restore)
  await waitFor(() => { expect(screen.getByRole('status')).toHaveTextContent('Текстовая копия восстановлена') })
  expect(screen.queryByRole('region', { name: 'Предпросмотр текстовой копии' })).not.toBeInTheDocument()
  expect(restoreTextBackup).toHaveBeenCalledTimes(2)
  fireEvent.change(file, { target: { files: [new File(['{}'], 'synthetic-next.json')] } })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  fireEvent.submit(screen.getByRole('form', { name: 'Импорт текстовой копии' }))
  expect(await screen.findByRole('button', { name: 'Восстановить текстовую копию' })).toBeDisabled()
  expect(screen.getByLabelText('Согласен заменить текстовые данные дневника')).not.toBeChecked()
})

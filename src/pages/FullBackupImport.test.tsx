import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { FullBackupImport } from './FullBackupImport'
import { readFullBackupFile } from '../media/fullBackupFile'
import { type FullBackup } from '../domain/fullBackup'

vi.mock('../media/fullBackupFile', () => ({ readFullBackupFile: vi.fn() }))
const backup: FullBackup = {
  format: 'health-diary-full', version: 1,
  text: { format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z', profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] },
  metadata: [], photos: [], documents: [], labResults: [], files: [],
}
beforeEach(() => { vi.resetAllMocks() })

it('показывает полностью проверенный состав, переносит фокус и очищает предпросмотр по выбору и отмене', async () => {
  vi.mocked(readFullBackupFile).mockResolvedValue(backup)
  render(<FullBackupImport />)
  const form = screen.getByRole('form', { name: 'Импорт полной копии' })
  expect(readFullBackupFile).not.toHaveBeenCalled()
  fireEvent.submit(form)
  const preview = await screen.findByRole('region', { name: 'Предпросмотр полной копии' })
  expect(preview).toHaveTextContent('Файлов: 0. Размер вложений: 0 байт.')
  expect(preview).toHaveTextContent('Фото: 0. Документов: 0. Показателей: 0. Настроек: 0.')
  expect(screen.getByRole('heading', { name: 'Предпросмотр полной копии' })).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Файл полной копии'), { target: { files: [new File(['{}'], 'synthetic-next.json')] } })
  expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  fireEvent.submit(form)
  await screen.findByRole('region', { name: 'Предпросмотр полной копии' })
  fireEvent.click(screen.getByRole('button', { name: 'Отменить полную копию' }))
  expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Файл полной копии')).toHaveFocus()
})

it('блокирует повторную проверку, не показывает старый предпросмотр при отказе и позволяет повторить', async () => {
  vi.mocked(readFullBackupFile).mockResolvedValueOnce(backup)
  let reject: (reason: unknown) => void = () => { throw new Error('Проверка не началась') }
  vi.mocked(readFullBackupFile).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  render(<FullBackupImport />)
  const form = screen.getByRole('form', { name: 'Импорт полной копии' })
  fireEvent.submit(form)
  await screen.findByRole('region', { name: 'Предпросмотр полной копии' })
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Проверить полную копию' })).toBeEnabled() })
  fireEvent.submit(form)
  await waitFor(() => { expect(readFullBackupFile).toHaveBeenCalledTimes(2) })
  expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Проверяем полную копию…' })).toBeDisabled()
  expect(screen.getByLabelText('Файл полной копии')).toBeDisabled()
  fireEvent.submit(form)
  expect(readFullBackupFile).toHaveBeenCalledTimes(2)
  reject(Object.assign(new Error('synthetic-private-file-details'), { name: 'NotReadableError' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('alert')).not.toHaveTextContent('synthetic-private-file-details')
  expect(screen.getByLabelText('Файл полной копии')).toHaveFocus()
  vi.mocked(readFullBackupFile).mockResolvedValueOnce(backup)
  fireEvent.submit(form)
  expect(await screen.findByRole('status')).toHaveTextContent('Полная копия проверена; база не изменена')
})

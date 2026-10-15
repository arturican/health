import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Profiler } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { FullBackupImport } from './FullBackupImport'
import { readFullBackupFile } from '../media/fullBackupFile'
import { type FullBackup } from '../domain/fullBackup'
import { restoreFullBackup } from '../data/fullBackupRepository'

vi.mock('../media/fullBackupFile', () => ({ readFullBackupFile: vi.fn() }))
vi.mock('../data/fullBackupRepository', () => ({ restoreFullBackup: vi.fn() }))
const backup: FullBackup = {
  format: 'health-diary-full', version: 1,
  text: { format: 'health-diary-text', version: 1, exportedAt: '2026-10-14T12:00:00.000Z', profile: null, weights: [], products: [], foodEntries: [], nutritionDays: [], steps: [], workouts: [], energyPlans: [] },
  metadata: [], photos: [], documents: [], labResults: [], files: [],
}
beforeEach(() => { vi.resetAllMocks() })

it('возвращает фокус файлу при отмене сразу после появления доступного предпросмотра', async () => {
  vi.mocked(readFullBackupFile).mockResolvedValue(backup)
  let cancelled = false
  // Клик между commit и пассивным эффектом заголовка воспроизводит раннюю отмену.
  render(<Profiler id="early-backup-cancel" onRender={() => {
    const button = screen.queryByRole('button', { name: 'Отменить полную копию' })
    if (!(button instanceof HTMLButtonElement) || button.disabled || cancelled) return
    cancelled = true
    button.focus()
    button.click()
  }}><FullBackupImport /></Profiler>)
  fireEvent.submit(screen.getByRole('form', { name: 'Импорт полной копии' }))
  await waitFor(() => {
    expect(readFullBackupFile).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Файл полной копии')).toHaveFocus()
  })
  expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  expect(restoreFullBackup).not.toHaveBeenCalled()
})

it('показывает полностью проверенный состав, переносит фокус и очищает предпросмотр по выбору и отмене', async () => {
  vi.mocked(readFullBackupFile).mockResolvedValue(backup)
  render(<FullBackupImport />)
  const form = screen.getByRole('form', { name: 'Импорт полной копии' })
  expect(readFullBackupFile).not.toHaveBeenCalled()
  fireEvent.submit(form)
  const preview = await screen.findByRole('region', { name: 'Предпросмотр полной копии' })
  expect(preview).toHaveTextContent('Файлов: 0. Размер вложений: 0 байт.')
  expect(preview).toHaveTextContent('Фото: 0. Документов: 0. Показателей: 0. Настроек: 0.')
  await waitFor(() => { expect(screen.getByRole('heading', { name: 'Предпросмотр полной копии' })).toHaveFocus() })
  fireEvent.change(screen.getByLabelText('Файл полной копии'), { target: { files: [new File(['{}'], 'synthetic-next.json')] } })
  expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  fireEvent.submit(form)
  await screen.findByRole('region', { name: 'Предпросмотр полной копии' })
  fireEvent.click(screen.getByRole('button', { name: 'Отменить полную копию' }))
  expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  await waitFor(() => { expect(screen.getByLabelText('Файл полной копии')).toHaveFocus() })
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
  await waitFor(() => { expect(screen.getByLabelText('Файл полной копии')).toHaveFocus() })
  vi.mocked(readFullBackupFile).mockResolvedValueOnce(backup)
  fireEvent.submit(form)
  expect(await screen.findByRole('status')).toHaveTextContent('Полная копия проверена; база не изменена')
})

it('восстанавливает только после согласия, блокирует повтор и сохраняет предпросмотр после отказа для повтора', async () => {
  vi.mocked(readFullBackupFile).mockResolvedValue(backup)
  let reject: (reason: unknown) => void = () => { throw new Error('Восстановление не началось') }
  vi.mocked(restoreFullBackup).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  render(<FullBackupImport />)
  fireEvent.submit(screen.getByRole('form', { name: 'Импорт полной копии' }))
  const button = await screen.findByRole('button', { name: 'Восстановить полную копию' })
  const confirmation = screen.getByRole('form', { name: 'Подтверждение полного восстановления' })
  const consent = screen.getByLabelText('Согласен заменить весь дневник, включая файлы и показатели')
  expect(button).toBeDisabled()
  fireEvent.submit(confirmation)
  expect(restoreFullBackup).not.toHaveBeenCalled()
  fireEvent.click(consent)
  fireEvent.click(button)
  await waitFor(() => { expect(restoreFullBackup).toHaveBeenCalledExactlyOnceWith(backup) })
  expect(screen.getByRole('button', { name: 'Восстанавливаем полную копию…' })).toBeDisabled()
  expect(screen.getByLabelText('Файл полной копии')).toBeDisabled()
  expect(consent).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Отменить полную копию' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('form', { name: 'Импорт полной копии' }))
  expect(readFullBackupFile).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('region', { name: 'Предпросмотр полной копии' })).toBeVisible()
  fireEvent.submit(confirmation)
  expect(restoreFullBackup).toHaveBeenCalledTimes(1)
  reject(Object.assign(new Error('synthetic-private-quota'), { name: 'QuotaExceededError' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('alert')).not.toHaveTextContent('synthetic-private-quota')
  expect(screen.getByRole('region', { name: 'Предпросмотр полной копии' })).toBeVisible()
  expect(consent).toBeChecked()
  await waitFor(() => { expect(consent).toHaveFocus() })
  vi.mocked(restoreFullBackup).mockResolvedValueOnce(undefined)
  fireEvent.click(screen.getByRole('button', { name: 'Восстановить полную копию' }))
  await waitFor(() => { expect(screen.getByRole('status')).toHaveTextContent('Полная копия восстановлена') })
  expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  await waitFor(() => { expect(screen.getByLabelText('Файл полной копии')).toHaveFocus() })
  expect(restoreFullBackup).toHaveBeenCalledTimes(2)
})

it('новый файл и отмена сбрасывают согласие на полную замену', async () => {
  vi.mocked(readFullBackupFile).mockResolvedValue(backup)
  render(<FullBackupImport />)
  const form = screen.getByRole('form', { name: 'Импорт полной копии' })
  for (const reset of ['file', 'cancel']) {
    fireEvent.submit(form)
    const consent = await screen.findByLabelText('Согласен заменить весь дневник, включая файлы и показатели')
    expect(consent).not.toBeChecked()
    fireEvent.click(consent)
    if (reset === 'file') fireEvent.change(screen.getByLabelText('Файл полной копии'), { target: { files: [new File(['{}'], 'synthetic-next.json')] } })
    else fireEvent.click(screen.getByRole('button', { name: 'Отменить полную копию' }))
    expect(screen.queryByRole('region', { name: 'Предпросмотр полной копии' })).not.toBeInTheDocument()
  }
  expect(restoreFullBackup).not.toHaveBeenCalled()
})

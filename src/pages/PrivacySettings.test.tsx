import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PrivacySettings } from './PrivacySettings'
import { db } from '../data/db'
import * as repository from '../data/visibilityRepository'
import * as access from '../dataAccess'
import { DEFAULT_VISIBILITY } from '../domain/visibility'

beforeEach(async () => { await db.open(); await db.metadata.clear() })
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await db.metadata.clear() })
function save() { fireEvent.click(screen.getByRole('button', { name: 'Сохранить видимость' })) }

it('загружает defaults без записи и объясняет сохранность данных и ограничения скрытия', async () => {
  render(<PrivacySettings />)
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем настройки видимости')
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  expect(await screen.findByRole('checkbox', { name: 'Показывать фото' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' })).toBeChecked()
  expect(screen.getByText(/Скрытие убирает раздел из интерфейса/)).toHaveTextContent('Записи и файлы сохраняются и входят в полную копию. Это не защита доступа и не шифрование.')
  expect(await db.metadata.count()).toBe(0)
})

it('сохраняет независимые boolean-флаги только после submit и показывает их после remount', async () => {
  const mixed = { version: 1, showPhotos: false, showDocuments: true }
  await repository.saveVisibility(mixed)
  const view = render(<PrivacySettings />)
  const photos = await screen.findByRole('checkbox', { name: 'Показывать фото' })
  const documents = screen.getByRole('checkbox', { name: 'Показывать документы и показатели' })
  expect(photos).not.toBeChecked()
  expect(documents).toBeChecked()
  fireEvent.click(photos)
  fireEvent.click(documents)
  expect(await repository.getVisibility()).toEqual(mixed)
  save()
  expect(await screen.findByText('Видимость разделов сохранена')).toBeVisible()
  expect(await repository.getVisibility()).toEqual({ version: 1, showPhotos: true, showDocuments: false })
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Сохранить видимость' })).toHaveFocus() })
  view.unmount()
  render(<PrivacySettings />)
  expect(await screen.findByRole('checkbox', { name: 'Показывать фото' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать фото' }))
  save()
  expect(await screen.findByText('Видимость разделов сохранена')).toBeVisible()
  expect(await repository.getVisibility()).toEqual({ version: 1, showPhotos: false, showDocuments: false })
})

it('сбой чтения скрывает разделы и блокирует запись до успешного повтора без раскрытия деталей', async () => {
  const privateValue = 'Синтетическое закрытое значение metadata'
  vi.spyOn(access, 'getVisibility').mockRejectedValueOnce(new Error(privateValue))
  const write = vi.spyOn(access, 'saveVisibility')
  render(<PrivacySettings />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось прочитать настройки видимости. Повторите загрузку настроек перед сохранением.')
  expect(screen.queryByText(privateValue)).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Показывать фото' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Сохранить видимость' })).toBeDisabled()
  save()
  expect(write).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку настроек' }))
  await waitFor(() => { expect(screen.queryByRole('alert')).not.toBeInTheDocument() })
  expect(screen.getByRole('checkbox', { name: 'Показывать фото' })).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' }))
  save()
  expect(await screen.findByText('Видимость разделов сохранена')).toBeVisible()
  expect(await repository.getVisibility()).toEqual({ version: 1, showPhotos: true, showDocuments: false })
  expect(screen.getByRole('button', { name: 'Сохранить видимость' })).toHaveFocus()
})

it('фоновая настройка не сбрасывает черновик и исходную версию', async () => {
  const read = vi.spyOn(access, 'getVisibility')
  const write = vi.spyOn(access, 'saveVisibility').mockRejectedValue(new Error('Данные изменились'))
  render(<PrivacySettings />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Показывать фото' }))
  await act(async () => { await repository.saveVisibility({ version: 1, showPhotos: true, showDocuments: false }) })
  await waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
  expect(screen.getByRole('checkbox', { name: 'Показывать фото' })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' })).toBeChecked()
  save()
  await screen.findByRole('alert')
  expect(write).toHaveBeenCalledWith({ version: 1, showPhotos: false, showDocuments: true }, DEFAULT_VISIBILITY)
})

it('сохраняет черновик и прежние флаги при отказе DB, возвращает фокус и допускает повтор', async () => {
  const initial = { version: 1, showPhotos: false, showDocuments: true }
  await repository.saveVisibility(initial)
  const saveVisibility = vi.spyOn(repository, 'saveVisibility').mockRejectedValueOnce(Object.assign(new Error('Синтетические закрытые детали'), { name: 'QuotaExceededError' }))
  render(<PrivacySettings />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Показывать фото' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' }))
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.queryByText('Синтетические закрытые детали')).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Показывать фото' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' })).not.toBeChecked()
  expect(await repository.getVisibility()).toEqual(initial)
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Сохранить видимость' })).toHaveFocus() })
  save()
  expect(await screen.findByText('Видимость разделов сохранена')).toBeVisible()
  expect(await repository.getVisibility()).toEqual({ version: 1, showPhotos: true, showDocuments: false })
  expect(saveVisibility).toHaveBeenCalledTimes(2)
})

it('блокирует поля и повторный submit до завершения записи, затем фокусирует сохранение', async () => {
  let complete: (() => void) | undefined
  const gate = new Promise<void>(resolve => { complete = resolve })
  const originalSave = repository.saveVisibility
  const saveVisibility = vi.spyOn(repository, 'saveVisibility').mockImplementationOnce(async input => { await gate; await originalSave(input) })
  render(<PrivacySettings />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Показывать фото' }))
  save()
  const pending = await screen.findByRole('button', { name: 'Сохраняем видимость…' })
  expect(pending).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Показывать фото' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' })).toBeDisabled()
  fireEvent.click(pending)
  expect(saveVisibility).toHaveBeenCalledTimes(1)
  expect(await repository.getVisibility()).toEqual(DEFAULT_VISIBILITY)
  complete?.()
  expect(await screen.findByText('Видимость разделов сохранена')).toBeVisible()
  expect(await repository.getVisibility()).toEqual({ version: 1, showPhotos: false, showDocuments: true })
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Сохранить видимость' })).toHaveFocus() })
})


it('повтор чтения после сбоя обновляет и значения, и исходную запись прежнего черновика', async () => {
  const latest = { version: 1 as const, showPhotos: false, showDocuments: false }
  const read = vi.spyOn(access, 'getVisibility')
  const write = vi.spyOn(access, 'saveVisibility')
  render(<PrivacySettings />)
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Показывать фото' }))
  read.mockRejectedValueOnce(new Error('Нет ответа'))
  await act(async () => { await repository.saveVisibility(latest) })
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку настроек' }))
  await waitFor(() => {
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Показывать фото' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Показывать документы и показатели' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Сохранить видимость' })).toBeEnabled()
  })
  save()
  await screen.findByText('Видимость разделов сохранена')
  expect(write).toHaveBeenCalledWith(latest, latest)
})

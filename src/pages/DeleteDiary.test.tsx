import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DeleteDiary } from './DeleteDiary'
import * as access from '../dataAccess'
import { clearDiary } from '../data/clearDiary'

vi.mock('../data/clearDiary', () => ({ clearDiary: vi.fn(), readDiaryGeneration: vi.fn() }))
beforeEach(() => { vi.resetAllMocks() })

it('объясняет удаление и скачанные копии, требует подтверждения и возвращает фокус после отмены', async () => {
  render(<DeleteDiary />)
  expect(screen.getByText(/Скачанные копии остаются на устройстве/)).toBeVisible()
  const button = screen.getByRole('button', { name: 'Удалить весь дневник' })
  button.focus()
  fireEvent.click(button)
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveAccessibleName(/включая фото, документы, показатели и настройки/)
  const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
  expect(cancel).toHaveFocus()
  expect(clearDiary).not.toHaveBeenCalled()
  fireEvent.click(cancel)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(button).toHaveFocus()
  expect(clearDiary).not.toHaveBeenCalled()
})

it('блокирует повтор/отмену в pending, сохраняет диалог после ошибки и позволяет повторить', async () => {
  let reject: (reason: unknown) => void = () => { throw new Error('Удаление не началось') }
  vi.mocked(clearDiary).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  const onCleared = vi.fn()
  render(<DeleteDiary onCleared={onCleared} />)
  const button = screen.getByRole('button', { name: 'Удалить весь дневник' })
  button.focus()
  fireEvent.click(button)
  const confirm = await screen.findByRole('button', { name: 'Подтвердить удаление' })
  fireEvent.click(confirm)
  await waitFor(() => { expect(clearDiary).toHaveBeenCalledTimes(1) })
  expect(button).toBeDisabled()
  expect(confirm).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled()
  fireEvent.click(confirm)
  expect(clearDiary).toHaveBeenCalledTimes(1)
  reject(Object.assign(new Error('synthetic-private-quota'), { name: 'QuotaExceededError' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByRole('alert')).not.toHaveTextContent('synthetic-private-quota')
  expect(screen.getByRole('alertdialog')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus()
  expect(onCleared).not.toHaveBeenCalled()
  vi.mocked(clearDiary).mockResolvedValueOnce(undefined)
  fireEvent.click(confirm)
  expect(await screen.findByRole('status')).toHaveTextContent('Все данные дневника удалены')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  await waitFor(() => { expect(button).toHaveFocus() })
  expect(clearDiary).toHaveBeenCalledTimes(2)
  expect(onCleared).toHaveBeenCalledTimes(1)
})


it('не открывает диалог и не удаляет данные при ошибке подготовки', async () => {
  vi.spyOn(access, 'prepareDiaryChange').mockRejectedValue(new Error('Нет соединения'))
  render(<DeleteDiary />)
  const button = screen.getByRole('button', { name: 'Удалить весь дневник' })
  fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(clearDiary).not.toHaveBeenCalled()
  await waitFor(() => { expect(button).toHaveFocus() })
})

it('повтор удаления сохраняет подтверждение, отмена требует нового', async () => {
  const original = { context: { epoch: 1, generation: 'synthetic' }, changeRevision: 2 }
  const next = { ...original, changeRevision: 3 }
  const prepare = vi.spyOn(access, 'prepareDiaryChange').mockResolvedValueOnce(original).mockResolvedValue(next)
  const remove = vi.spyOn(access, 'clearDiary').mockRejectedValue(new Error('Нет ответа'))
  render(<DeleteDiary />)
  fireEvent.click(screen.getByRole('button', { name: 'Удалить весь дневник' }))
  const confirm = await screen.findByRole('button', { name: 'Подтвердить удаление' })
  fireEvent.click(confirm)
  await screen.findByRole('alert')
  fireEvent.click(confirm)
  await waitFor(() => { expect(remove).toHaveBeenCalledTimes(2) })
  expect(remove.mock.calls).toEqual([[original], [original]])
  expect(prepare).toHaveBeenCalledTimes(1)
  await waitFor(() => { expect(confirm).toBeEnabled() })
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  fireEvent.click(screen.getByRole('button', { name: 'Удалить весь дневник' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить удаление' }))
  await waitFor(() => { expect(remove).toHaveBeenLastCalledWith(next) })
})

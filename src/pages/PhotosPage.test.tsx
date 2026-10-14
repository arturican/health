import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PhotosPage } from './PhotosPage'
import { db } from '../data/db'
import * as repository from '../data/photoRepository'
import { readPhotoInput, type Photo } from '../domain/photo'

vi.mock('../ui/FileImage', () => ({ FileImage: ({ alt, width, height }: { alt: string; width?: number; height?: number }) => <img alt={alt} width={width} height={height} src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKz8AAAAASUVORK5CYII=" /> }))

// JSDOM FormData reads an internal FileList instead of fireEvent's selected files.
// Actual browser upload/FormData is exercised by the browser suite.
class FormDataWithSelectedFile extends FormData {
  constructor(form?: HTMLFormElement) {
    super(form)
    const input = form?.elements.namedItem('file')
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined
    if (file) this.set('file', file)
  }
}
const photo: Photo = {
  id: '00000000-0000-4000-8000-000000000001', fileId: '00000000-0000-4000-8000-000000000101',
  date: '2026-10-14', title: 'Синтетический снимок', note: 'Синтетическая заметка', width: 320, height: 240,
}
const file = () => new File(['synthetic-photo-input'], 'synthetic.png', { type: 'image/png' })
function fill(selected = file()) {
  fireEvent.change(screen.getByLabelText('Дата фото'), { target: { value: '2026-10-13' } })
  fireEvent.change(screen.getByLabelText('Подпись фото'), { target: { value: '  Синтетический снимок  ' } })
  fireEvent.change(screen.getByLabelText('Заметка к фото (необязательно)'), { target: { value: '  Синтетическая заметка  ' } })
  fireEvent.change(screen.getByLabelText('Файл фото'), { target: { files: [selected] } })
  return selected
}
function save() { fireEvent.click(screen.getByRole('button', { name: 'Добавить фото' })) }
function successfulSave() {
  return vi.spyOn(repository, 'addPhoto').mockImplementation(async input => {
    const result = { ...photo, ...readPhotoInput(input) }
    await db.photos.add(result)
    return result
  })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  vi.stubGlobal('FormData', FormDataWithSelectedFile)
  await db.open()
  await db.photos.clear()
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.photos.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('показывает пустую галерею, объяснения обработки и сохраняет реальные метаданные с очисткой формы', async () => {
  const add = successfulSave()
  const view = render(<PhotosPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Фото' })).toBeVisible()
  await screen.findByText('Фотографий пока нет.')
  expect(screen.getByLabelText('Файл фото')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  expect(screen.getByText(/JPEG без EXIF/)).toHaveTextContent('прозрачность становится белым фоном')
  const selected = fill()
  save()
  expect(await screen.findByText('Фото добавлено')).toBeVisible()
  expect(add).toHaveBeenCalledWith({ date: '2026-10-13', title: 'Синтетический снимок', note: 'Синтетическая заметка' }, selected)
  const list = await screen.findByRole('list', { name: 'Фотографии по датам' })
  expect(within(list).getByRole('heading', { level: 3, name: 'Синтетический снимок' })).toBeVisible()
  expect(within(list).getByText('2026-10-13')).toBeVisible()
  expect(within(list).getByText('Синтетическая заметка')).toBeVisible()
  expect(within(list).getByRole('img', { name: 'Синтетический снимок' })).toHaveAttribute('width', '320')
  await waitFor(() => { expect(screen.getByLabelText('Подпись фото')).toHaveValue('') })
  await waitFor(() => { expect(screen.getByLabelText('Подпись фото')).toHaveFocus() })
  expect(screen.getByLabelText('Дата фото')).toHaveValue('2026-10-14')
  expect(screen.getByLabelText('Заметка к фото (необязательно)')).toHaveValue('')
  expect(screen.getByLabelText<HTMLInputElement>('Файл фото').files).toHaveLength(0)
  view.unmount()
  render(<PhotosPage />)
  expect(await screen.findByRole('img', { name: 'Синтетический снимок' })).toBeVisible()
})

it('выводит сохранённые карточки в порядке дат и оставляет отсутствие заметки пустым', async () => {
  const older = { ...photo, id: '00000000-0000-4000-8000-000000000002', fileId: '00000000-0000-4000-8000-000000000102', date: '2026-10-12', title: 'Прежний синтетический снимок', note: '' }
  await db.photos.bulkAdd([older, photo])
  render(<PhotosPage />)
  const list = await screen.findByRole('list', { name: 'Фотографии по датам' })
  expect(within(list).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Синтетический снимок', 'Прежний синтетический снимок'])
  expect(within(list).getAllByRole('img')).toHaveLength(2)
  expect(within(list).getByRole('article', { name: 'Прежний синтетический снимок, 2026-10-12' })).not.toHaveTextContent('Синтетическая заметка')
})

it('связывает будущую дату, пустую подпись и отсутствие файла с полями до обработки', async () => {
  const add = vi.spyOn(repository, 'addPhoto')
  render(<PhotosPage />)
  await screen.findByText('Фотографий пока нет.')
  fireEvent.change(screen.getByLabelText('Дата фото'), { target: { value: '2026-10-15' } })
  save()
  expect(screen.getByLabelText('Дата фото')).toHaveFocus()
  expect(screen.getByLabelText('Дата фото')).toHaveAccessibleDescription('Дата фото не может быть в будущем')
  fireEvent.change(screen.getByLabelText('Дата фото'), { target: { value: '2026-10-14' } })
  save()
  expect(screen.getByLabelText('Подпись фото')).toHaveFocus()
  expect(screen.getByLabelText('Подпись фото')).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(screen.getByLabelText('Подпись фото'), { target: { value: 'Синтетический снимок' } })
  save()
  expect(screen.getByLabelText('Файл фото')).toHaveFocus()
  expect(screen.getByLabelText('Файл фото')).toHaveAccessibleDescription(/Выберите файл фото/)
  expect(add).not.toHaveBeenCalled()
  expect(await db.photos.count()).toBe(0)
})

it('показывает ошибку формата у файла с фокусом и сохраняет дату, подпись и выбранный File', async () => {
  const add = vi.spyOn(repository, 'addPhoto').mockRejectedValueOnce(new Error('Неподдерживаемый формат вложения'))
  render(<PhotosPage />)
  await screen.findByText('Фотографий пока нет.')
  const selected = fill()
  save()
  await waitFor(() => { expect(screen.getByLabelText('Файл фото')).toHaveFocus() })
  expect(screen.getByLabelText('Файл фото')).toHaveAccessibleDescription(/Неподдерживаемый формат вложения/)
  expect(screen.getByLabelText('Подпись фото')).toHaveValue('  Синтетический снимок  ')
  expect(screen.getByLabelText('Дата фото')).toHaveValue('2026-10-13')
  expect(screen.getByLabelText<HTMLInputElement>('Файл фото').files?.[0]).toBe(selected)
  expect(add).toHaveBeenCalledTimes(1)
})

it('сохраняет ввод при отказе DB, скрывает подробности и допускает повторную попытку', async () => {
  const add = successfulSave().mockRejectedValueOnce(Object.assign(new Error('Синтетические закрытые детали'), { name: 'QuotaExceededError' }))
  render(<PhotosPage />)
  await screen.findByText('Фотографий пока нет.')
  const selected = fill()
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.queryByText('Синтетические закрытые детали')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Заметка к фото (необязательно)')).toHaveValue('  Синтетическая заметка  ')
  expect(screen.getByLabelText<HTMLInputElement>('Файл фото').files?.[0]).toBe(selected)
  save()
  expect(await screen.findByText('Фото добавлено')).toBeVisible()
  expect(add).toHaveBeenCalledTimes(2)
  expect(await db.photos.count()).toBe(1)
})

it('блокирует повторное сохранение и поля, пока идёт обработка фото', async () => {
  let complete: ((value: Photo) => void) | undefined
  const processing = new Promise<Photo>(resolve => { complete = resolve })
  const add = vi.spyOn(repository, 'addPhoto').mockReturnValueOnce(processing)
  render(<PhotosPage />)
  await screen.findByText('Фотографий пока нет.')
  fill()
  save()
  const pending = await screen.findByRole('button', { name: 'Сохраняем…' })
  expect(pending).toBeDisabled()
  expect(screen.getByLabelText('Файл фото')).toBeDisabled()
  expect(screen.getByLabelText('Подпись фото')).toBeDisabled()
  fireEvent.click(pending)
  expect(add).toHaveBeenCalledTimes(1)
  complete?.(photo)
  expect(await screen.findByText('Фото добавлено')).toBeVisible()
  await waitFor(() => { expect(screen.getByLabelText('Подпись фото')).toHaveFocus() })
})

it('редактор проверяет дату, сохраняет ошибочный ввод для повтора и возвращает фокус в новую форму', async () => {
  await db.photos.add(photo)
  const update = vi.spyOn(repository, 'updatePhoto').mockRejectedValueOnce(Object.assign(new Error('private'), { name: 'QuotaExceededError' }))
  const add = vi.spyOn(repository, 'addPhoto')
  render(<PhotosPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Изменить фото 1: Синтетический снимок' }))
  expect(screen.getByRole('form', { name: 'Редактирование фото' })).toBeVisible()
  expect(screen.queryByLabelText('Файл фото')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Дата фото')).toHaveFocus()
  fireEvent.change(screen.getByLabelText('Дата фото'), { target: { value: '2026-10-15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить фото' }))
  expect(screen.getByLabelText('Дата фото')).toHaveAccessibleDescription('Дата фото не может быть в будущем')
  expect(update).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Дата фото'), { target: { value: '2026-10-13' } })
  fireEvent.change(screen.getByLabelText('Подпись фото'), { target: { value: 'Изменённый синтетический снимок' } })
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить фото' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.getByLabelText('Подпись фото')).toHaveValue('Изменённый синтетический снимок')
  expect(screen.queryByText('private')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить фото' }))
  expect(await screen.findByText('Фото обновлено')).toBeVisible()
  expect(await screen.findByRole('heading', { level: 3, name: 'Изменённый синтетический снимок' })).toBeVisible()
  await waitFor(() => { expect(screen.getByLabelText('Подпись фото')).toHaveFocus() })
  expect(await db.photos.get(photo.id)).toEqual({ ...photo, date: '2026-10-13', title: 'Изменённый синтетический снимок' })
  expect(add).not.toHaveBeenCalled()
})

it('отмена правки и отмена удаления сохраняют запись; подтверждение переводит фокус в галерею', async () => {
  await db.photos.add(photo)
  render(<PhotosPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Изменить фото 1: Синтетический снимок' }))
  fireEvent.change(screen.getByLabelText('Подпись фото'), { target: { value: 'Несохранённая правка' } })
  fireEvent.click(screen.getByRole('button', { name: 'Отменить правку фото' }))
  expect(screen.getByLabelText('Подпись фото')).toHaveFocus()
  expect(await db.photos.get(photo.id)).toEqual(photo)
  const remove = screen.getByRole('button', { name: 'Удалить фото 1: Синтетический снимок' })
  remove.focus()
  fireEvent.click(remove)
  const dialog = screen.getByRole('alertdialog')
  expect(within(dialog).getByRole('button', { name: 'Отмена' })).toHaveFocus()
  expect(screen.getByLabelText('Файл фото')).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  expect(remove).toHaveFocus()
  expect(await db.photos.get(photo.id)).toEqual(photo)
  fireEvent.click(remove)
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  expect(await screen.findByText('Фото удалено')).toBeVisible()
  await screen.findByText('Фотографий пока нет.')
  expect(screen.getByRole('heading', { name: 'Галерея фото' })).toHaveFocus()
  expect(screen.getByLabelText('Файл фото')).toBeEnabled()
  expect(await db.photos.count()).toBe(0)
})

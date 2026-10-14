import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocumentsPage } from './DocumentsPage'
import { db } from '../data/db'
import * as repository from '../data/documentRepository'
import { readDocumentInput, type DiaryDocument } from '../domain/document'

vi.mock('./DocumentFile', () => ({ DocumentFile: () => <p>Вложение доступно локально.</p> }))

// JSDOM FormData uses an internal FileList; actual upload is covered in Chromium.
class FormDataWithSelectedFile extends FormData {
  constructor(form?: HTMLFormElement) {
    super(form)
    const input = form?.elements.namedItem('file')
    const selected = input instanceof HTMLInputElement ? input.files?.[0] : undefined
    if (selected) this.set('file', selected)
  }
}
const document: DiaryDocument = {
  id: '00000000-0000-4000-8000-000000000001', fileId: '00000000-0000-4000-8000-000000000101',
  date: '2026-10-14', title: 'Синтетический анализ', kind: 'lab', note: 'Синтетическая заметка',
}
const file = () => new File(['%PDF-1.7\nSynthetic\n%%EOF\n'], 'synthetic.pdf', { type: 'application/pdf' })
function fill(selected = file()) {
  fireEvent.change(screen.getByLabelText('Дата документа'), { target: { value: '2026-10-13' } })
  fireEvent.change(screen.getByLabelText('Название документа'), { target: { value: '  Синтетический документ  ' } })
  fireEvent.change(screen.getByLabelText('Категория документа'), { target: { value: 'report' } })
  fireEvent.change(screen.getByLabelText('Заметка к документу (необязательно)'), { target: { value: '  Синтетическая заметка  ' } })
  fireEvent.change(screen.getByLabelText('Файл документа'), { target: { files: [selected] } })
  return selected
}
function save() { fireEvent.click(screen.getByRole('button', { name: 'Добавить документ' })) }
function successfulSave() {
  return vi.spyOn(repository, 'addDocument').mockImplementation(async input => {
    const result = { ...document, ...readDocumentInput(input) }
    await db.documents.add(result)
    return result
  })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  vi.stubGlobal('FormData', FormDataWithSelectedFile)
  await db.open()
  await db.documents.clear()
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.documents.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('показывает пустое состояние, сохраняет метаданные и очищает форму с возвратом фокуса', async () => {
  const add = successfulSave()
  const view = render(<DocumentsPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Документы' })).toBeVisible()
  expect(screen.getByRole('form', { name: 'Добавление документа' })).toBeVisible()
  expect(await screen.findByText('Документов пока нет.')).toBeVisible()
  expect(screen.getByLabelText('Категория документа')).toHaveValue('lab')
  expect(screen.getByLabelText('Файл документа')).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png,image/webp')
  const selected = fill()
  save()
  expect(await screen.findByText('Документ добавлен')).toBeVisible()
  expect(add).toHaveBeenCalledWith({ date: '2026-10-13', title: 'Синтетический документ', kind: 'report', note: 'Синтетическая заметка' }, selected)
  const list = await screen.findByRole('list', { name: 'Сохранённые документы' })
  expect(within(list).getByRole('heading', { level: 3, name: 'Синтетический документ' })).toBeVisible()
  expect(within(list).getByText('2026-10-13')).toBeVisible()
  expect(within(list).getByText(/Выписка/)).toBeVisible()
  expect(within(list).getByText('Синтетическая заметка')).toBeVisible()
  await waitFor(() => { expect(screen.getByLabelText('Название документа')).toHaveValue('') })
  await waitFor(() => { expect(screen.getByLabelText('Название документа')).toHaveFocus() })
  expect(screen.getByLabelText('Дата документа')).toHaveValue('2026-10-14')
  expect(screen.getByLabelText('Категория документа')).toHaveValue('lab')
  expect(screen.getByLabelText('Заметка к документу (необязательно)')).toHaveValue('')
  expect(screen.getByLabelText<HTMLInputElement>('Файл документа').files).toHaveLength(0)
  view.unmount()
  render(<DocumentsPage />)
  expect(await screen.findByRole('heading', { level: 3, name: 'Синтетический документ' })).toBeVisible()
})

it('сортирует по датам и ищет по названию, заметке, категории и дате без изменения DB', async () => {
  const older: DiaryDocument = { ...document, id: '00000000-0000-4000-8000-000000000002', fileId: '00000000-0000-4000-8000-000000000102', date: '2026-10-12', title: 'Синтетическая выписка', kind: 'report', note: 'Контрольное событие' }
  const imaging: DiaryDocument = { ...document, id: '00000000-0000-4000-8000-000000000003', fileId: '00000000-0000-4000-8000-000000000103', date: '2026-10-13', title: 'Синтетический снимок исследования', kind: 'imaging', note: '' }
  await db.documents.bulkAdd([older, document, imaging])
  render(<DocumentsPage />)
  const list = await screen.findByRole('list', { name: 'Сохранённые документы' })
  expect(within(list).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([document.title, imaging.title, older.title])
  const search = screen.getByLabelText('Найти документ')
  for (const [query, expected] of [['  СИнТЕТИЧЕСКАЯ ВЫПИСКА  ', older.title], ['контрольное событие', older.title], ['ИсСледОвАнИЕ', imaging.title], ['2026-10-14', document.title]]) {
    fireEvent.change(search, { target: { value: query } })
    await waitFor(() => { expect(within(list).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([expected]) })
  }
  fireEvent.change(search, { target: { value: 'несуществующий синтетический запрос' } })
  expect(screen.getByText('По запросу ничего не найдено.')).toBeVisible()
  fireEvent.change(search, { target: { value: '' } })
  expect(within(screen.getByRole('list', { name: 'Сохранённые документы' })).getAllByRole('listitem')).toHaveLength(3)
  expect(await db.documents.toArray()).toEqual([document, older, imaging])
})

it('связывает будущую дату, пустое название и отсутствие файла с полями до обработки', async () => {
  const add = vi.spyOn(repository, 'addDocument')
  render(<DocumentsPage />)
  await screen.findByText('Документов пока нет.')
  fireEvent.change(screen.getByLabelText('Дата документа'), { target: { value: '2026-10-15' } })
  save()
  expect(screen.getByLabelText('Дата документа')).toHaveFocus()
  expect(screen.getByLabelText('Дата документа')).toHaveAccessibleDescription('Дата документа не может быть в будущем')
  fireEvent.change(screen.getByLabelText('Дата документа'), { target: { value: '2026-10-14' } })
  save()
  expect(screen.getByLabelText('Название документа')).toHaveFocus()
  expect(screen.getByLabelText('Название документа')).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(screen.getByLabelText('Название документа'), { target: { value: 'Синтетический документ' } })
  save()
  expect(screen.getByLabelText('Файл документа')).toHaveFocus()
  expect(screen.getByLabelText('Файл документа')).toHaveAccessibleDescription(/Выберите файл документа/)
  expect(add).not.toHaveBeenCalled()
  expect(await db.documents.count()).toBe(0)
})

it('показывает ошибку содержимого у файла и сохраняет введённые метаданные и File', async () => {
  vi.spyOn(repository, 'addDocument').mockRejectedValueOnce(new Error('Неподдерживаемый формат вложения'))
  render(<DocumentsPage />)
  await screen.findByText('Документов пока нет.')
  const selected = fill()
  save()
  await waitFor(() => { expect(screen.getByLabelText('Файл документа')).toHaveFocus() })
  expect(screen.getByLabelText('Файл документа')).toHaveAccessibleDescription(/Неподдерживаемый формат вложения/)
  expect(screen.getByLabelText('Название документа')).toHaveValue('  Синтетический документ  ')
  expect(screen.getByLabelText('Категория документа')).toHaveValue('report')
  expect(screen.getByLabelText<HTMLInputElement>('Файл документа').files?.[0]).toBe(selected)
})

it('скрывает детали отказа DB, сохраняет File и допускает повторную попытку', async () => {
  const add = successfulSave().mockRejectedValueOnce(Object.assign(new Error('Синтетические закрытые детали'), { name: 'QuotaExceededError' }))
  render(<DocumentsPage />)
  await screen.findByText('Документов пока нет.')
  const selected = fill()
  save()
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  expect(screen.queryByText('Синтетические закрытые детали')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Дата документа')).toHaveValue('2026-10-13')
  expect(screen.getByLabelText('Заметка к документу (необязательно)')).toHaveValue('  Синтетическая заметка  ')
  expect(screen.getByLabelText<HTMLInputElement>('Файл документа').files?.[0]).toBe(selected)
  save()
  expect(await screen.findByText('Документ добавлен')).toBeVisible()
  expect(add).toHaveBeenCalledTimes(2)
  expect(await db.documents.count()).toBe(1)
})

it('блокирует поля и повторный клик во время проверки и сохранения файла', async () => {
  let complete: ((value: DiaryDocument) => void) | undefined
  const processing = new Promise<DiaryDocument>(resolve => { complete = resolve })
  const add = vi.spyOn(repository, 'addDocument').mockReturnValueOnce(processing)
  render(<DocumentsPage />)
  await screen.findByText('Документов пока нет.')
  fill()
  save()
  const pending = await screen.findByRole('button', { name: 'Сохраняем…' })
  expect(pending).toBeDisabled()
  expect(screen.getByLabelText('Файл документа')).toBeDisabled()
  expect(screen.getByLabelText('Категория документа')).toBeDisabled()
  fireEvent.click(pending)
  expect(add).toHaveBeenCalledTimes(1)
  complete?.(document)
  expect(await screen.findByText('Документ добавлен')).toBeVisible()
  await waitFor(() => { expect(screen.getByLabelText('Название документа')).toHaveFocus() })
})

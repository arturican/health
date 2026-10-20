import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProductCatalog } from './ProductCatalog'
import { FoodJournal } from './FoodJournal'
import { WorkoutJournal } from './WorkoutJournal'
import { LabSection } from './LabSection'
import { StorageBoundary } from '../ui/StorageBoundary'
import { DayProvider } from '../ui/DayContext'
import { QueryFeedback } from '../client/QueryFeedback'
import { invalidateQueries } from '../client/queries'
import { setClientSession } from '../client/session'
import { clientDiary, clientSession, jsonResponse } from '../../tests/clientSession'

vi.unmock('../dataAccess')

const product = { id: '10000000-0000-4000-8000-000000000011', name: 'Учебный продукт', source: '', kcal: 100, protein: null, fat: null, carbs: null, archived: false }
const { name, source, kcal, protein, fat, carbs } = product
const food = { id: '10000000-0000-4000-8000-000000000012', date: '2026-10-20', meal: 'breakfast', productId: product.id, grams: 100, note: '', snapshot: { name, source, kcal, protein, fat, carbs } }
const workout = { id: '10000000-0000-4000-8000-000000000013', date: food.date, kind: 'Учебная тренировка', minutes: 30, kcal: null, source: '', note: '' }
const document = { id: '10000000-0000-4000-8000-000000000014', fileId: '10000000-0000-4000-8000-000000000015', date: food.date, title: 'Учебный документ', kind: 'lab', note: '' }
const lab = { id: '10000000-0000-4000-8000-000000000016', documentId: document.id, date: food.date, name: 'Учебный показатель', value: { type: 'number', number: 5, operator: 'eq' }, unit: '', reference: '', note: '' }
const collections: Record<string, unknown[]> = { products: [product], food: [food], workouts: [workout], documents: [document], 'lab-results': [lab] }
let failed = ''
beforeEach(() => {
  failed = ''
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  setClientSession(clientSession, clientDiary)
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(input => {
    if (typeof input !== 'string') throw new Error('Тест ожидает относительный URL')
    if (input === '/api/v1/diary-state') return Promise.resolve(jsonResponse(clientDiary))
    const collection = /^\/api\/v1\/([^?]+)\?/.exec(input)?.[1]
    if (!collection || !collections[collection]) throw new Error('Неожиданный synthetic URL')
    if (collection === failed) throw new Error('Synthetic disconnected transport')
    return Promise.resolve(jsonResponse({ items: collections[collection].map(value => ({ value, revision: 1 })), nextAfter: null }))
  }))
})
afterEach(() => {
  cleanup()
  setClientSession(null)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const cases = [
  { view: <ProductCatalog />, collection: 'products', edit: 'Править продукт Учебный продукт', form: 'Редактирование продукта', field: 'Калории на 100 г, ккал', draft: '125', save: 'Сохранить продукт', cancel: 'Отменить правку продукта' },
  { view: <FoodJournal />, collection: 'products', edit: 'Изменить запись еды 1: Учебный продукт', form: 'Редактирование еды', field: 'Масса порции, г', draft: '125', save: 'Сохранить запись еды', cancel: 'Отменить правку еды' },
  { view: <WorkoutJournal />, collection: 'workouts', edit: 'Изменить тренировку 1: Учебная тренировка', form: 'Редактирование тренировки', field: 'Вид тренировки', draft: 'Учебная правка', save: 'Сохранить тренировку', cancel: 'Отменить правку тренировки' },
  { view: <LabSection />, collection: 'documents', edit: 'Изменить показатель 1: Учебный показатель', form: 'Редактирование показателя', field: 'Название показателя', draft: 'Учебная правка', save: 'Сохранить показатель', cancel: 'Отменить правку показателя' },
]
it.each(cases)('$form позволяет отменить правку после отказа $collection', async test => {
  const caught = vi.fn()
  render(<main tabIndex={-1}><QueryFeedback /><StorageBoundary><DayProvider>{test.view}</DayProvider></StorageBoundary></main>, { onCaughtError: caught })
  if (test.collection === 'documents') fireEvent.change(await screen.findByLabelText('Бланк для показателей'), { target: { value: document.id } })
  fireEvent.click(await screen.findByRole('button', { name: test.edit }))
  const form = await screen.findByRole('form', { name: test.form })
  const field = within(form).getByLabelText(test.field)
  fireEvent.change(field, { target: { value: test.draft } })
  failed = test.collection
  act(() => { invalidateQueries() })
  await screen.findByText(/На экране остаются прежние значения; ваш ввод сохранён/)
  expect(field).toHaveValue(test.draft)
  expect(within(form).getByRole('button', { name: test.save })).toBeDisabled()
  const cancel = within(form).getByRole('button', { name: test.cancel })
  expect(cancel).toBeEnabled()
  fireEvent.click(cancel)
  await waitFor(() => { expect(screen.queryByRole('form', { name: test.form })).not.toBeInTheDocument() })
  if (test.form === 'Редактирование еды') {
    await screen.findByRole('heading', { name: 'Раздел недоступен' })
    expect(caught).toHaveBeenCalledTimes(1)
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ message: 'Не удалось получить данные. Проверьте соединение и повторите действие.' })
  } else expect(caught).not.toHaveBeenCalled()
  await waitFor(() => {
    const focused = globalThis.document.activeElement
    expect(focused === screen.getByRole('main') || (focused instanceof HTMLInputElement && !focused.disabled)).toBe(true)
  })
})

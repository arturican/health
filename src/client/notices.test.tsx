import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { clientDiary, clientSession } from '../../tests/clientSession'
import { QueryFeedback } from './QueryFeedback'
import { setNotice } from './notices'
import { setClientSession, updateDiaryState } from './session'

afterEach(() => { setClientSession(null) })
it('показывает результат без ошибки загрузки, закрывает его и очищает при выходе', () => {
  setClientSession(clientSession, clientDiary)
  render(<QueryFeedback />)
  act(() => { setNotice('Полная копия восстановлена') })
  expect(screen.getByRole('status')).toHaveTextContent('Полная копия восстановлена')
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть сообщение' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => { setNotice('Все данные дневника удалены'); setClientSession(null) })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('смена generation того же владельца объясняет сброс ввода, новый владелец очищает notice', () => {
  setClientSession(clientSession, clientDiary)
  render(<QueryFeedback />)
  act(() => { updateDiaryState({ ...clientDiary, generation: '30000000-0000-4000-8000-000000000001' }) })
  expect(screen.getByRole('status')).toHaveTextContent('Несохранённый ввод сброшен; проверьте записи перед повторным действием.')
  act(() => { setClientSession({ ...clientSession, account: { ...clientSession.account, id: '40000000-0000-4000-8000-000000000001' } }, clientDiary) })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
it('initial diary и прежний generation/revision refresh не сообщают ложный сброс', () => {
  setClientSession(clientSession)
  render(<QueryFeedback />)
  act(() => { updateDiaryState(clientDiary) })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => { setNotice('Сохранено'); updateDiaryState({ ...clientDiary, revision: 2, changeRevision: 1 }) })
  expect(screen.getByRole('status')).toHaveTextContent('Сохранено')
})

it('потерянный после remount фокус переходит в сообщение, закрытие возвращает его в main', () => {
  setClientSession(clientSession, clientDiary)
  render(<main tabIndex={-1}><QueryFeedback /></main>)
  act(() => { updateDiaryState({ ...clientDiary, generation: '30000000-0000-4000-8000-000000000001' }) })
  expect(screen.getByRole('complementary', { name: 'Обновление данных' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть сообщение' }))
  expect(screen.getByRole('main')).toHaveFocus()
})

it('notice не перехватывает фокус доступного поля', () => {
  setClientSession(clientSession, clientDiary)
  render(<main><input aria-label="Учебное поле" /><QueryFeedback /></main>)
  const field = screen.getByRole('textbox', { name: 'Учебное поле' })
  field.focus()
  act(() => { setNotice('Сохранено') })
  expect(field).toHaveFocus()
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { clientDiary, clientSession } from '../../tests/clientSession'
import { QueryFeedback } from './QueryFeedback'
import { setNotice } from './notices'
import { setClientSession } from './session'

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

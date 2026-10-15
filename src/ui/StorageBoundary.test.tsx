import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StorageBoundary } from './StorageBoundary'

function BrokenSection(): never {
  throw new Error('synthetic-private-record: тестовое содержимое данных')
}

describe('Граница ошибок раздела', () => {
  it('показывает содержимое доступного раздела без сообщения об ошибке', () => {
    render(<StorageBoundary><h2>Синтетический раздел</h2></StorageBoundary>)

    expect(screen.getByRole('heading', { name: 'Синтетический раздел' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Вернуться к дневнику' })).not.toBeInTheDocument()
  })

  it('показывает общий fallback без содержимого ошибки и восстанавливается при смене ключа', () => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {
      // React сообщает об ожидаемой ошибке этого синтетического раздела.
    })
    try {
      const { container, rerender } = render(<StorageBoundary key="photos"><BrokenSection /></StorageBoundary>)

      expect(screen.getByRole('heading', { level: 1, name: 'Раздел недоступен' })).toBeVisible()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Не удалось открыть данные. Повторите загрузку; если ошибка сохраняется, обновите страницу.',
      )
      expect(screen.getByRole('link', { name: 'Вернуться к дневнику' })).toHaveAttribute('href', '#today')
      expect(container).not.toHaveTextContent('synthetic-private-record')
      expect(container).not.toHaveTextContent('тестовое содержимое данных')
      expect(diagnostics).toHaveBeenCalled()

      rerender(<StorageBoundary key="photos"><h2>Исправленный раздел</h2></StorageBoundary>)
      expect(screen.getByRole('alert')).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Исправленный раздел' })).not.toBeInTheDocument()

      rerender(<StorageBoundary key="weight"><h2>Другой раздел</h2></StorageBoundary>)
      expect(screen.getByRole('heading', { name: 'Другой раздел' })).toBeVisible()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      diagnostics.mockRestore()
    }
  })

  it('повторно открывает исправленный раздел по кнопке без перезагрузки страницы', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<StorageBoundary><BrokenSection /></StorageBoundary>)
    rerender(<StorageBoundary><h2>Исправленный раздел</h2></StorageBoundary>)
    expect(screen.queryByRole('heading', { name: 'Исправленный раздел' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку раздела' }))
    expect(screen.getByRole('heading', { name: 'Исправленный раздел' })).toBeVisible()
  })
})

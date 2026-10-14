import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Feedback, formText, useAction } from './actions'

function pendingTask() {
  const signals: { complete?: () => void } = {}
  const task = vi.fn(() => new Promise<void>(resolve => {
    signals.complete = resolve
  }))
  return {
    task,
    complete() {
      if (!signals.complete) throw new Error('Действие ещё не началось')
      signals.complete()
    },
  }
}

describe('formText', () => {
  it('возвращает строку без внешних пробелов, сохраняя введённый ноль', () => {
    const form = new FormData()
    form.set('name', '  Синтетическая запись \t')
    form.set('steps', ' 0 ')
    form.set('note', '  ')

    expect(formText(form, 'name')).toBe('Синтетическая запись')
    expect(formText(form, 'steps')).toBe('0')
    expect(formText(form, 'note')).toBe('')
  })

  it('отклоняет отсутствующее поле и файл вместо текстового значения', () => {
    const form = new FormData()
    form.set('file', new File(['synthetic'], 'fixture.txt', { type: 'text/plain' }))

    expect(() => formText(form, 'missing')).toThrow(/Поле не заполнено/)
    expect(() => formText(form, 'file')).toThrow(/Поле не заполнено/)
  })
})

describe('useAction', () => {
  it('до первого действия не сообщает об ожидании, ошибке или успехе', () => {
    const { result } = renderHook(useAction)

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.message).toBeNull()
  })

  it('не дублирует ожидающее действие и разрешает повтор после успеха', async () => {
    const pending = pendingTask()
    const { result } = renderHook(useAction)

    act(() => {
      result.current.run(pending.task)
      result.current.run(pending.task)
    })
    expect(result.current.pending).toBe(true)
    await waitFor(() => {
      expect(pending.task).toHaveBeenCalledTimes(1)
    })
    act(() => {
      result.current.run(pending.task)
    })
    expect(pending.task).toHaveBeenCalledTimes(1)

    act(() => {
      pending.complete()
    })
    await waitFor(() => {
      expect(result.current.message).toBe('Сохранено')
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()

    const repeat = vi.fn<() => void>()
    act(() => {
      result.current.run(repeat, 'Скопировано')
    })
    expect(result.current.pending).toBe(true)
    expect(result.current.message).toBeNull()
    await waitFor(() => {
      expect(result.current.message).toBe('Скопировано')
    })
    expect(repeat).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toBe(false)
  })

  it('показывает синхронную ошибку и очищает её при повторной попытке', async () => {
    const failure = vi.fn(() => {
      throw new Error('Не удалось сохранить')
    })
    const { result } = renderHook(useAction)

    act(() => {
      result.current.run(failure)
    })
    await waitFor(() => {
      expect(result.current.error).toBe('Не удалось сохранить')
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.message).toBeNull()

    const retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    act(() => {
      result.current.run(retry)
    })
    expect(result.current.error).toBeNull()
    expect(result.current.pending).toBe(true)
    await waitFor(() => {
      expect(result.current.message).toBe('Сохранено')
    })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it.each<{ reason: unknown; expected: string }>([
    { reason: new Error('Хранилище недоступно'), expected: 'Хранилище недоступно' },
    { reason: 'неизвестный ответ', expected: 'Не удалось выполнить действие' },
  ])('сообщает об отклонённом асинхронном действии: $expected', async ({ reason, expected }) => {
    const task = vi.fn<() => Promise<void>>().mockRejectedValue(reason)
    const { result } = renderHook(useAction)

    act(() => {
      result.current.run(task)
    })
    await waitFor(() => {
      expect(result.current.error).toBe(expected)
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.message).toBeNull()
  })
})

describe('Сообщение о результате', () => {
  it.each([{ error: null, message: null }, { error: '', message: '' }])(
    'не объявляет отсутствующее или пустое сообщение', ({ error, message }) => {
      const { container } = render(<Feedback error={error} message={message} />)
      expect(container).toBeEmptyDOMElement()
    },
  )

  it('объявляет успешное сообщение как статус', () => {
    render(<Feedback error={null} message="Сохранено" />)

    expect(screen.getByRole('status')).toHaveTextContent('Сохранено')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('объявляет ошибку и отдаёт ей приоритет над сообщением об успехе', () => {
    render(<Feedback error="Ошибка сохранения" message="Сохранено" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Ошибка сохранения')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Сохранено')).not.toBeInTheDocument()
  })
})

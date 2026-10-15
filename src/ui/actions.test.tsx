import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Feedback, formText, readField, useAction } from './actions'

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

describe('Чтение поля формы', () => {
  it('передаёт reader обрезанный текст и возвращает проверенное значение', () => {
    const form = new FormData()
    form.set('height', ' 170 ')
    const errors: Record<string, string> = {}
    expect(readField(form, 'height', Number, errors)).toBe(170)
    expect(errors).toEqual({})
  })

  it('привязывает ожидаемую ошибку проверки к полю', () => {
    const form = new FormData()
    form.set('height', 'fixture')
    const errors: Record<string, string> = {}
    const reader = vi.fn(() => {
      throw new Error('Введите рост числом')
    })
    expect(readField(form, 'height', reader, errors)).toBeNull()
    expect(errors).toEqual({ height: 'Введите рост числом' })
  })

  it('отклоняет файл вместо текста без вызова reader', () => {
    const form = new FormData()
    form.set('height', new File(['synthetic'], 'fixture.txt'))
    const errors: Record<string, string> = {}
    const reader = vi.fn(Number)
    expect(readField(form, 'height', reader, errors)).toBeNull()
    expect(reader).not.toHaveBeenCalled()
    expect(errors).toEqual({ height: 'Поле не заполнено' })
  })

  it('заменяет неизвестную причину сбоя общим сообщением', () => {
    const form = new FormData()
    form.set('height', 'fixture')
    const errors: Record<string, string> = {}
    const reason: unknown = { synthetic: true }
    const reader = vi.fn(() => {
      throw reason
    })
    expect(readField(form, 'height', reader, errors)).toBeNull()
    expect(errors).toEqual({ height: 'Проверьте значение поля' })
  })
})

describe('useAction', () => {
  it('синхронно блокирует внешние действия до запуска задачи и разблокирует их после успеха', async () => {
    const onPendingChange = vi.fn<(pending: boolean) => void>()
    const pending = pendingTask()
    const { result } = renderHook(() => useAction(onPendingChange))
    expect(onPendingChange).not.toHaveBeenCalled()

    act(() => {
      result.current.run(pending.task, 'Синтетическая запись сохранена')
      expect(onPendingChange.mock.calls).toEqual([[true]])
      expect(pending.task).not.toHaveBeenCalled()
    })
    await waitFor(() => { expect(pending.task).toHaveBeenCalledTimes(1) })
    expect(onPendingChange.mock.calls).toEqual([[true]])
    act(() => { pending.complete() })
    await waitFor(() => { expect(onPendingChange.mock.calls).toEqual([[true], [false]]) })
    expect(result.current.message).toBe('Синтетическая запись сохранена')
    expect(result.current.pending).toBe(false)
  })

  it('повторный запуск и reset не снимают внешнюю блокировку незавершённой задачи', async () => {
    const onPendingChange = vi.fn<(pending: boolean) => void>()
    const pending = pendingTask()
    const duplicate = vi.fn<() => void>()
    const { result } = renderHook(() => useAction(onPendingChange))
    act(() => {
      result.current.run(pending.task)
      result.current.run(duplicate)
      result.current.reset()
      expect(onPendingChange.mock.calls).toEqual([[true]])
    })
    await waitFor(() => { expect(pending.task).toHaveBeenCalledTimes(1) })
    act(() => { result.current.run(duplicate) })
    expect(duplicate).not.toHaveBeenCalled()
    expect(onPendingChange.mock.calls).toEqual([[true]])
    expect(result.current.pending).toBe(true)

    act(() => { pending.complete() })
    await waitFor(() => { expect(onPendingChange.mock.calls).toEqual([[true], [false]]) })
    const next = pendingTask()
    act(() => {
      result.current.run(next.task)
      expect(onPendingChange.mock.calls).toEqual([[true], [false], [true]])
    })
    await waitFor(() => { expect(next.task).toHaveBeenCalledTimes(1) })
    act(() => { result.current.run(duplicate) })
    expect(duplicate).not.toHaveBeenCalled()
    expect(onPendingChange.mock.calls).toEqual([[true], [false], [true]])
    act(() => { next.complete() })
    await waitFor(() => { expect(onPendingChange.mock.calls).toEqual([[true], [false], [true], [false]]) })
  })

  it.each(['синхронная', 'асинхронная'] as const)(
    '%s ошибка снимает внешнюю блокировку и разрешает новую попытку', async kind => {
      const onPendingChange = vi.fn<(pending: boolean) => void>()
      const reason = new Error('Синтетическое сохранение не удалось')
      const failure = vi.fn(() => {
        if (kind === 'синхронная') throw reason
        return Promise.reject(reason)
      })
      const { result } = renderHook(() => useAction(onPendingChange))
      act(() => {
        result.current.run(failure)
        expect(onPendingChange.mock.calls).toEqual([[true]])
        expect(failure).not.toHaveBeenCalled()
      })
      await waitFor(() => { expect(onPendingChange.mock.calls).toEqual([[true], [false]]) })
      expect(failure).toHaveBeenCalledTimes(1)
      expect(result.current.error).toBe(reason.message)
      expect(result.current.pending).toBe(false)

      const retry = pendingTask()
      act(() => {
        result.current.run(retry.task)
        expect(onPendingChange.mock.calls).toEqual([[true], [false], [true]])
      })
      await waitFor(() => { expect(retry.task).toHaveBeenCalledTimes(1) })
      expect(result.current.error).toBeNull()
      expect(result.current.pending).toBe(true)
      act(() => { retry.complete() })
      await waitFor(() => { expect(onPendingChange.mock.calls).toEqual([[true], [false], [true], [false]]) })
      expect(result.current.message).toBe('Сохранено')
      expect(result.current.error).toBeNull()
    },
  )

  it('до первого действия не сообщает об ожидании, ошибке или успехе', () => {
    const { result } = renderHook(useAction)

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.message).toBeNull()
  })

  it('очищает завершённое сообщение, сохраняя блокировку ожидающего действия', async () => {
    const { result } = renderHook(useAction)
    const pending = pendingTask()
    act(() => { result.current.run(pending.task) })
    await waitFor(() => { expect(pending.task).toHaveBeenCalledTimes(1) })
    act(() => { result.current.reset() })
    expect(result.current.pending).toBe(true)
    act(() => { pending.complete() })
    await waitFor(() => { expect(result.current.message).toBe('Сохранено') })
    act(() => { result.current.reset() })
    expect(result.current.pending).toBe(false)
    expect(result.current.message).toBeNull()
    expect(result.current.error).toBeNull()
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
    { reason: Object.assign(new Error('synthetic-private-storage-details'), { name: 'QuotaExceededError' }), expected: 'Не удалось выполнить действие' },
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

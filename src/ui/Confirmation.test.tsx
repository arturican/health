import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Confirmation } from './Confirmation'

const question = 'Удалить синтетическую запись?'

describe('Confirmation: клавиатурный фокус', () => {
  it('при открытии переводит фокус на отмену и возвращает его открывшей кнопке после закрытия', async () => {
    function Example() {
      const [open, setOpen] = useState(false)
      return <>
        <button type="button" onClick={() => { setOpen(true) }}>Удалить синтетическую запись</button>
        {open && <Confirmation question={question} pending={false} onConfirm={() => { setOpen(false) }} onCancel={() => { setOpen(false) }} />}
      </>
    }
    render(<Example />)
    const opener = screen.getByRole('button', { name: 'Удалить синтетическую запись' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('alertdialog', { name: question })
    const cancel = within(dialog).getByRole('button', { name: 'Отмена' })
    await waitFor(() => { expect(cancel).toHaveFocus() })
    fireEvent.click(cancel)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => { expect(opener).toHaveFocus() })
  })

  it('после отказа удаления возвращает фокус на отмену, включая повторную попытку', async () => {
    const confirm = vi.fn<() => void>()
    const cancel = vi.fn<() => void>()
    const view = (pending: boolean) => <Confirmation question={question} pending={pending} onConfirm={confirm} onCancel={cancel} />
    const { rerender } = render(view(false))
    const dialog = screen.getByRole('alertdialog', { name: question })
    const confirmButton = within(dialog).getByRole('button', { name: 'Подтвердить удаление' })
    const cancelButton = within(dialog).getByRole('button', { name: 'Отмена' })
    await waitFor(() => { expect(cancelButton).toHaveFocus() })
    for (const attempt of [1, 2]) {
      confirmButton.focus()
      fireEvent.click(confirmButton)
      expect(confirm).toHaveBeenCalledTimes(attempt)
      rerender(view(true))
      expect(confirmButton).toBeDisabled()
      expect(cancelButton).toBeDisabled()
      // Native browsers can move focus to body when the active button becomes disabled.
      if (attempt === 2) confirmButton.blur()
      rerender(view(false))
      expect(screen.getByRole('alertdialog', { name: question })).toBe(dialog)
      expect(cancelButton).toBeEnabled()
      await waitFor(() => { expect(cancelButton).toHaveFocus() })
    }
    expect(cancel).not.toHaveBeenCalled()
  })

  it('не отбирает сознательно перенесённый за пределы диалога фокус после pending', async () => {
    const view = (pending: boolean) => <>
      <label>Синтетическая заметка<input type="text" /></label>
      <Confirmation question={question} pending={pending} onConfirm={() => { /* parent keeps the failed confirmation open */ }} onCancel={() => { /* unused in this scenario */ }} />
    </>
    const { rerender } = render(view(false))
    const confirm = screen.getByRole('button', { name: 'Подтвердить удаление' })
    confirm.focus()
    fireEvent.click(confirm)
    rerender(view(true))
    const outside = screen.getByRole('textbox', { name: 'Синтетическая заметка' })
    outside.focus()
    expect(outside).toHaveFocus()
    rerender(view(false))
    await waitFor(() => { expect(outside).toHaveFocus() })
    expect(screen.getByRole('alertdialog', { name: question })).toBeVisible()
  })

  it('возвращает фокус после быстрого отказа без отдельного рендера pending=true', async () => {
    const confirm = vi.fn<() => void>()
    const view = (failed: boolean) => <>
      <Confirmation question={question} pending={false} onConfirm={confirm} onCancel={() => { /* unused in this scenario */ }} />
      {failed && <p role="alert">Синтетическое удаление не удалось</p>}
    </>
    const { rerender } = render(view(false))
    const confirmButton = screen.getByRole('button', { name: 'Подтвердить удаление' })
    confirmButton.focus()
    fireEvent.click(confirmButton)
    expect(confirm).toHaveBeenCalledTimes(1)
    // The parent can batch a rejected operation into one completed render.
    rerender(view(true))
    expect(screen.getByRole('alert')).toHaveTextContent('Синтетическое удаление не удалось')
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus() })
  })
})
it('при обновлении данных блокирует подтверждение, сохраняя доступную отмену', () => {
  const cancel = vi.fn(), confirm = vi.fn()
  render(<Confirmation question="Удалить учебную запись?" pending={false} confirmDisabled onConfirm={confirm} onCancel={cancel} />)
  expect(screen.getByRole('button', { name: 'Подтвердить удаление' })).toBeDisabled()
  const button = screen.getByRole('button', { name: 'Отмена' })
  expect(button).toBeEnabled()
  fireEvent.click(button)
  expect(cancel).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
})
it('возвращает фокус в main, когда исходная строка стала недоступной', async () => {
  function Example() {
    const [open, setOpen] = useState(false)
    const [stale, setStale] = useState(false)
    return <main tabIndex={-1}>
      <button disabled={stale} onClick={() => { setOpen(true) }}>Удалить учебную строку</button>
      <button onClick={() => { setStale(true) }}>Обновить учебный список</button>
      {open && <Confirmation question={question} pending={false} onConfirm={() => {}} onCancel={() => { setOpen(false) }} />}
    </main>
  }
  render(<Example />)
  const opener = screen.getByRole('button', { name: 'Удалить учебную строку' })
  opener.focus()
  fireEvent.click(opener)
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus() })
  fireEvent.click(screen.getByRole('button', { name: 'Обновить учебный список' }))
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  await waitFor(() => { expect(screen.getByRole('main')).toHaveFocus() })
})

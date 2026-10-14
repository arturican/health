import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import axe from 'axe-core'
import { db } from './data/db'

async function clear() { await db.transaction('rw', db.tables, async () => { await Promise.all(db.tables.map(table => table.clear())) }) }
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  await clear()
  window.history.replaceState(null, '', '/')
})

afterEach(async () => {
  cleanup()
  await clear()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('Стартовый экран', () => {
  it('показывает доступный дневник и предлагает заполнить отсутствующий профиль', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible()
    expect(await screen.findByRole('link', { name: 'Заполнить профиль' })).toHaveAttribute('href', '#profile')
    expect(await screen.findByText('Шаги: нет данных.')).toBeVisible()
  })

  it('проверка доступности обнаруживает кнопку без доступного имени', async () => {
    const button = document.createElement('button')
    document.body.append(button)
    try {
      const result = await axe.run(button, { runOnly: ['button-name'] })
      expect(result.violations.map(rule => rule.id)).toContain('button-name')
    } finally {
      button.remove()
    }
  })

  it('предлагает быстрые переходы к доступным журналам', () => {
    render(<App />)

    const links = within(screen.getByRole('navigation', { name: 'Быстрые записи' }))
    expect(links.getByRole('link', { name: 'Записать вес' })).toHaveAttribute('href', '#weight')
    expect(links.getByRole('link', { name: 'Записать еду' })).toHaveAttribute('href', '#nutrition')
    expect(links.getByRole('link', { name: 'Открыть активность' })).toHaveAttribute('href', '#activity')
  })
})

describe('Переходы между разделами', () => {
  it('переход к содержимому сохраняет текущий раздел', () => {
    window.history.replaceState(null, '', '/#profile')
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Перейти к содержимому' }))
    expect(window.location.hash).toBe('#profile')
    expect(screen.getByRole('main')).toHaveFocus()
    expect(screen.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()
  })
  it('открывает начальный раздел по hash', () => {
    window.history.replaceState(null, '', '/#weight')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Вес' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Вес' })).toHaveAttribute('aria-current', 'page')
    expect(window.location.hash).toBe('#weight')
    expect(screen.queryByRole('heading', { level: 1, name: 'Сегодня' })).not.toBeInTheDocument()
  })

  it('показывает Сегодня при неизвестном hash', () => {
    window.history.replaceState(null, '', '/#missing')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page')
  })

  it('по нажатию ссылки сохраняет маршрут и переводит фокус к содержимому', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Вес' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Вес' })).toBeVisible()
    expect(window.location.hash).toBe('#weight')
    expect(screen.getByRole('link', { name: 'Вес' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Сегодня' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('main')).toHaveFocus()

    fireEvent.click(screen.getByRole('link', { name: 'Сегодня' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible()
    expect(window.location.hash).toBe('#today')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('возвращается к стартовому экрану через историю браузера', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Профиль' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()

    window.history.back()
    await waitFor(() => { expect(window.location.hash).toBe(''); })
    expect(await screen.findByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('main')).toHaveFocus()
  })
})

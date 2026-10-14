import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import axe from 'axe-core'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('Стартовый экран', () => {
  it('показывает дневник и объясняет, что запись данных ещё недоступна', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
    expect(screen.getByText(/Ведение записей появится на следующих этапах/)).toBeVisible()
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

  it('предлагает переход к существующему разделу будущих возможностей', () => {
    render(<App />)

    const link = screen.getByRole('link', { name: 'Что будет в дневнике' })
    const region = screen.getByRole('region', { name: 'Что будет в дневнике' })
    expect(link).toHaveAttribute('href', `#${region.id}`)
    expect(within(region).getByRole('heading', { name: 'Профиль и измерения' })).toBeVisible()
    expect(within(region).getByRole('heading', { name: 'Питание и активность' })).toBeVisible()
    expect(within(region).getByRole('heading', { name: 'Фото и документы' })).toBeVisible()
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
    expect(screen.queryByRole('heading', { level: 1, name: 'Дневник здоровья' })).not.toBeInTheDocument()
  })

  it('показывает Сегодня при неизвестном hash', () => {
    window.history.replaceState(null, '', '/#missing')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
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
    expect(await screen.findByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
    expect(window.location.hash).toBe('#today')
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('возвращается к стартовому экрану через историю браузера', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Профиль' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible()

    window.history.back()
    await waitFor(() => { expect(window.location.hash).toBe(''); })
    expect(await screen.findByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('main')).toHaveFocus()
  })
})

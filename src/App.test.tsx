import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import axe from 'axe-core'
import { db } from './data/db'
import { saveVisibility } from './data/visibilityRepository'
import { VISIBILITY_SETTING_ID } from './domain/visibility'
import type { Profile } from './domain/profile'

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
  it.each(['missing', 'denied'])('не блокирует оболочку из-за недоступности браузерного IndexedDB: %s', failure => {
    const original = Object.getOwnPropertyDescriptor(window, 'indexedDB')
    Object.defineProperty(window, 'indexedDB', failure === 'missing'
      ? { configurable: true, value: undefined }
      : { configurable: true, get() { throw new DOMException('Synthetic storage refusal', 'SecurityError') } })
    try {
      render(<App />)
      expect(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible()
      expect(screen.getByRole('main')).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Хранилище недоступно' })).not.toBeInTheDocument()
    } finally {
      cleanup()
      if (original) Object.defineProperty(window, 'indexedDB', original)
      else Reflect.deleteProperty(window, 'indexedDB')
    }
  })

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
  it('оставляет сводку и редактор веса доступными при невозможности расчёта ИМТ', async () => {
    const profile: Profile = { id: 'self', name: '', heightCm: Number.MIN_VALUE, birthDate: null, formulaSex: 'none' }
    const weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-12', kg: 70 }
    await db.profiles.put(profile)
    await db.weights.put(weight)
    render(<App />)
    expect(await screen.findByText('70 кг, измерено 12.10.2026.')).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'ИМТ (справочно)' })).getByRole('alert')).toHaveTextContent('Не удалось рассчитать ИМТ')
    expect(await screen.findByRole('region', { name: 'Итоги питания' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Вес' }))
    expect(await screen.findByRole('form', { name: 'Новое измерение' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Изменить вес за 12.10.2026' }))
    expect(screen.getByRole('form', { name: 'Редактирование веса' })).toBeVisible()
    expect(screen.getByLabelText('Вес, кг')).toHaveValue('70')
    expect(screen.queryByRole('heading', { name: 'Раздел недоступен' })).not.toBeInTheDocument()
    expect(await db.weights.toArray()).toEqual([weight])
    expect(await db.profiles.get('self')).toEqual(profile)
  })

  it('прямые маршруты скрытых разделов оставляют доступ к настройкам и не показывают формы или вложения', async () => {
    await saveVisibility({ version: 1, showPhotos: false, showDocuments: false })
    for (const route of ['photos', 'documents']) {
      window.history.replaceState(null, '', `/#${route}`)
      render(<App />)
      expect(await screen.findByRole('heading', { level: 1, name: 'Раздел скрыт' })).toBeVisible()
      expect(screen.getByRole('link', { name: 'Открыть настройки видимости' })).toHaveAttribute('href', '#settings')
      expect(screen.getByRole('link', { name: 'Настройки' })).toBeVisible()
      expect(screen.queryByRole('link', { name: 'Фото' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Документы' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Файл документа')).not.toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      cleanup()
    }
  })

  it('повреждённая настройка скрывает документы и позволяет открыть настройки для исправления', async () => {
    await db.metadata.put({ id: VISIBILITY_SETTING_ID, value: 'Синтетическая повреждённая строка' })
    window.history.replaceState(null, '', '/#documents')
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Раздел скрыт' })
    fireEvent.click(screen.getByRole('link', { name: 'Открыть настройки видимости' }))
    await screen.findByRole('heading', { level: 1, name: 'Настройки' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось прочитать настройки видимости')
    expect(screen.getByLabelText('Показывать фото')).not.toBeChecked()
    expect(screen.getByLabelText('Показывать документы и показатели')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Сохранить видимость' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Повторить загрузку настроек' })).toBeEnabled()
  })

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

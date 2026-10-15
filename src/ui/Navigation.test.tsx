import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getRoute, isRoute, Navigation, type Route } from './Navigation'

describe('Разбор маршрута', () => {
  it.each(['today', 'profile', 'weight', 'nutrition', 'activity', 'photos', 'documents', 'settings'])(
    'распознаёт раздел %s', route => {
      expect(isRoute(route)).toBe(true)
      expect(getRoute(`#${route}`)).toBe(route)
    },
  )

  it.each(['', '#', '#plan', '#missing', '#WEIGHT', '#constructor', '#toString', '#__proto__'])(
    'возвращает Сегодня для неподдерживаемого hash %s', hash => {
      expect(getRoute(hash)).toBe('today')
    },
  )

  it.each(['', 'plan', 'missing', 'constructor', 'toString', '__proto__'])(
    'не считает маршрутами посторонние значения %s', value => {
      expect(isRoute(value)).toBe(false)
    },
  )
})

describe('Навигация', () => {
  it('независимо скрывает выбранные разделы и сохраняет переход к настройкам', () => {
    const view = render(<Navigation active="settings" showPhotos={false} showDocuments={true} />)
    expect(screen.queryByRole('link', { name: 'Фото' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Документы' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Настройки' })).toHaveAttribute('aria-current', 'page')
    view.rerender(<Navigation active="settings" showPhotos={true} showDocuments={false} />)
    expect(screen.getByRole('link', { name: 'Фото' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Документы' })).not.toBeInTheDocument()
  })

  it('показывает все доступные разделы с адресами перехода', () => {
    render(<Navigation active="today" />)

    const navigation = screen.getByRole('navigation', { name: 'Разделы дневника' })
    const links = within(navigation).getAllByRole('link')
    expect(links.map(link => link.textContent)).toEqual([
      'Сегодня', 'Профиль', 'Вес', 'Питание', 'Активность', 'Фото', 'Документы', 'Настройки',
    ])
    expect(within(navigation).getByRole('link', { name: 'Вес' })).toHaveAttribute('href', '#weight')
    expect(within(navigation).getByRole('link', { name: 'Сегодня' })).toHaveAttribute('href', '#today')
  })

  it.each<{ active: Route; name: string }>([
    { active: 'today', name: 'Сегодня' },
    { active: 'weight', name: 'Вес' },
  ])('отмечает только текущий раздел $name', ({ active, name }) => {
    render(<Navigation active={active} />)

    const navigation = screen.getByRole('navigation', { name: 'Разделы дневника' })
    expect(within(navigation).getAllByRole('link', { current: 'page' })).toEqual([
      within(navigation).getByRole('link', { name }),
    ])
  })
})

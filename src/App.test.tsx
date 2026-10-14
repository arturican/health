import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('Стартовый экран', () => {
  it('показывает дневник и объясняет, что запись данных ещё недоступна', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Дневник здоровья' })).toBeVisible()
    expect(screen.getByText(/Ведение записей появится на следующих этапах/)).toBeVisible()
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

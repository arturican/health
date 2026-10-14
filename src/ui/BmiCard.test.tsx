import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BmiCard } from './BmiCard'
import type { Profile, Weight } from '../domain/profile'

const profile: Profile = { id: 'self', name: '', heightCm: 180, birthDate: '2000-01-01', formulaSex: 'none' }
const weight: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-01', kg: 72 }

it('показывает справочное число, источник измерения и ограничения', () => {
  render(<BmiCard profile={profile} weight={weight} date="2026-10-14" />)
  const card = screen.getByRole('region', { name: 'ИМТ (справочно)' })
  expect(within(card).getByText('22,2')).toBeVisible()
  expect(within(card).getByText(/измерению от 01.10.2026/)).toBeVisible()
  expect(within(card).getByText(/От 18,5 до 25/)).toBeVisible()
  expect(within(card).getByText(/Это не диагноз/)).toBeVisible()
  expect(within(card).getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
})

it.each([null, { ...profile, birthDate: null }, { ...profile, birthDate: '2007-10-14' }, { ...profile, birthDate: '2026-10-15' }])('не показывает взрослую категорию без нужных параметров или возраста', value => {
  render(<BmiCard profile={value} weight={weight} date="2026-10-14" />)
  expect(screen.queryByText(/Справочная категория CDC/)).not.toBeInTheDocument()
  if (value) expect(screen.getByText(/Взрослая категория доступна с 20 лет/)).toBeVisible()
  else expect(screen.getByText(/Нужны рост/)).toBeVisible()
})

it.each([null, { ...weight, date: '2026-10-15' }])('не превращает отсутствие подходящего веса в ноль', value => {
  render(<BmiCard profile={profile} weight={value} date="2026-10-14" />)
  expect(screen.getByText(/Нужны рост/)).toBeVisible()
  expect(screen.queryByText('0,0')).not.toBeInTheDocument()
})

it('сохраняет точную категорию при округлении значения к границе', () => {
  render(<BmiCard profile={{ ...profile, heightCm: 200 }} weight={{ ...weight, kg: 99.99 }} date="2026-10-14" />)
  expect(screen.getByText('25,0')).toBeVisible()
  expect(screen.getByText(/От 18,5 до 25/)).toBeVisible()
  expect(screen.getByText(/категория учитывает точное значение/)).toBeVisible()
})

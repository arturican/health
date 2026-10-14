import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import type { Profile, Weight } from '../domain/profile'
import '../styles.css'

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.energyPlans, db.profiles, db.weights, async () => {
    await db.energyPlans.clear()
    await db.weights.clear()
    await db.profiles.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
}

beforeEach(async () => {
  await resetTestState()
  await page.viewport(375, 812)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
})

afterEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
  vi.useRealTimers()
})

test('новые версии отделяют цель от расхода, проверяют ввод и сохраняют прежние снимки после изменения профиля', async () => {
  const profile: Profile = { id: 'self', name: 'Синтетический профиль для плана', heightCm: 170, birthDate: '1996-10-14', formulaSex: 'male' }
  const weight: Weight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-01', kg: 70 }
  await db.transaction('rw', db.profiles, db.weights, async () => {
    await db.profiles.add(profile)
    await db.weights.add(weight)
  })
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  const form = page.getByRole('form', { name: 'Новая версия энергетического плана', exact: true })
  const history = page.getByRole('list', { name: 'Версии энергетического плана', exact: true })
  const date = form.getByLabelText('Дата начала действия плана', { exact: true })
  const goal = form.getByLabelText('Калорийная цель, ккал/сутки (необязательно)', { exact: true })
  const method = form.getByLabelText('Способ оценки суточного расхода', { exact: true })
  const manual = form.getByLabelText('Общая ручная оценка расхода, ккал/сутки', { exact: true })
  const factor = form.getByLabelText('Ваш коэффициент активности', { exact: true })
  const source = form.getByLabelText('Источник оценки расхода (необязательно)', { exact: true })
  const save = form.getByRole('button', { name: 'Сохранить новую версию', exact: true })
  const row = (revision: number, effectiveFrom = '2026-10-14') => history.getByRole('listitem').filter({ hasText: `Версия ${String(revision)}, действует с ${effectiveFrom}` })
  async function expectSaved(revision: number, effectiveFrom = '2026-10-14') {
    await expect.element(row(revision, effectiveFrom)).toBeVisible()
    await expect.element(page.getByRole('status').filter({ hasText: 'Новая версия плана сохранена' })).toHaveTextContent('Новая версия плана сохранена')
    await expect.element(date).toHaveFocus()
  }
  await expect.element(page.getByText('План пока не задан.', { exact: true })).toBeVisible()
  await expect.element(date).toHaveValue('2026-10-14')
  await source.fill('Синтетическая версия без расхода')
  await userEvent.keyboard('{Tab}')
  await expect.element(save).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expectSaved(1)
  await expect.element(row(1).getByText('Цель: нет данных ккал/сутки.', { exact: true })).toBeVisible()
  await expect.element(row(1).getByText('Оценка расхода не задана.', { exact: true })).toBeVisible()
  const snapshot = { kg: 70, weightDate: '2026-10-01', heightCm: 170, age: 30, formulaSex: 'male' }
  const first = await db.energyPlans.orderBy('revision').toArray()
  expect(first).toMatchObject([{ revision: 1, goalKcal: null, method: 'none', manualKcal: null, factor: null, snapshot }])

  await date.fill('2026-10-13')
  await save.click()
  await expect.element(date).toHaveAccessibleDescription('Новая версия действует с сегодняшнего или будущего дня')
  await expect.element(date).toHaveFocus()
  expect(await db.energyPlans.orderBy('revision').toArray()).toEqual(first)
  await date.fill('2026-10-14')
  await goal.fill('-1')
  await save.click()
  await expect.element(goal).toHaveAccessibleDescription('Ккал не могут быть отрицательными')
  await expect.element(goal).toHaveFocus()
  expect(await db.energyPlans.orderBy('revision').toArray()).toEqual(first)
  await goal.fill('2000')
  await method.selectOptions('manual')
  await manual.fill('333')
  await method.selectOptions('factor')
  await expect.element(manual).not.toBeInTheDocument()
  await expect.element(factor).toHaveValue('')
  await factor.fill('1,9')
  await method.selectOptions('manual')
  await expect.element(factor).not.toBeInTheDocument()
  await expect.element(manual).toHaveValue('')
  await method.selectOptions('factor')
  await save.click()
  await expect.element(factor).toHaveAccessibleDescription('Введите число без разделителей тысяч')
  await expect.element(factor).toHaveFocus()
  expect(await db.energyPlans.orderBy('revision').toArray()).toEqual(first)
  await method.selectOptions('manual')
  await manual.fill('0')
  await save.click()
  await expectSaved(2)
  await expect.element(row(2).getByText('Цель: 2000 ккал/сутки.', { exact: true })).toBeVisible()
  await expect.element(row(2).getByText('Общая ручная оценка: 0 ккал/сутки.', { exact: true })).toBeVisible()
  await goal.fill('0')
  await method.selectOptions('factor')
  await factor.fill('1,4')
  await source.fill('  Синтетический коэффициент  ')
  await save.click()
  await expectSaved(3)
  await expect.element(row(3).getByText('Цель: 0 ккал/сутки.', { exact: true })).toBeVisible()
  await expect.element(row(3).getByText('Коэффициент активности: 1,4. Расход в покое (оценка): 1 618 ккал/сутки.', { exact: true })).toBeVisible()
  await expect.element(row(3).getByText('Источник оценки: Синтетический коэффициент', { exact: true })).toBeVisible()
  const frozen = await db.energyPlans.orderBy('revision').toArray()
  expect(frozen).toMatchObject([
    { revision: 1, effectiveFrom: '2026-10-14', goalKcal: null, method: 'none', manualKcal: null, factor: null, snapshot },
    { revision: 2, effectiveFrom: '2026-10-14', goalKcal: 2000, method: 'manual', manualKcal: 0, factor: null, snapshot },
    { revision: 3, effectiveFrom: '2026-10-14', goalKcal: 0, method: 'factor', manualKcal: null, factor: 1.4, snapshot },
  ])

  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await page.getByRole('button', { name: 'Редактировать профиль', exact: true }).click()
  await page.getByLabelText('Рост, см', { exact: true }).fill('180')
  await page.getByLabelText('Пол для формулы расхода (необязательно)', { exact: true }).selectOptions('female')
  await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Профиль обновлён')
  expect(await db.energyPlans.orderBy('revision').toArray()).toEqual(frozen)
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  await date.fill('2026-10-20')
  await method.selectOptions('factor')
  await factor.fill('1,4')
  await save.click()
  await expectSaved(4, '2026-10-20')
  const saved = await db.energyPlans.orderBy('revision').toArray()
  expect(saved).toHaveLength(4)
  expect(saved.slice(0, 3)).toEqual(frozen)
  expect(saved[3]).toMatchObject({
    revision: 4, createdOn: '2026-10-14', effectiveFrom: '2026-10-20', goalKcal: null, method: 'factor', manualKcal: null, factor: 1.4,
    snapshot: { ...snapshot, heightCm: 180, formulaSex: 'female' },
  })
  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(row(3).getByText('Снимок на 2026-10-14: рост 170 см; вес 70 кг от 2026-10-01; возраст 30 лет; параметр формулы: мужской.', { exact: true })).toBeVisible()
  await expect.element(row(3).getByText('Коэффициент активности: 1,4. Расход в покое (оценка): 1 618 ккал/сутки.', { exact: true })).toBeVisible()
  await expect.element(row(4, '2026-10-20').getByText('Снимок на 2026-10-14: рост 180 см; вес 70 кг от 2026-10-01; возраст 30 лет; параметр формулы: женский.', { exact: true })).toBeVisible()
  await expect.element(row(4, '2026-10-20').getByText('Коэффициент активности: 1,4. Расход в покое (оценка): 1 514 ккал/сутки.', { exact: true })).toBeVisible()
  expect(await db.energyPlans.orderBy('revision').toArray()).toEqual(saved)
  expect(await db.weights.toArray()).toEqual([weight])
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(reopened.container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}, 15000)

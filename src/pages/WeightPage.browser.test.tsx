import { afterEach, beforeEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import { createProfile } from '../data/profileRepository'
import '../styles.css'

const initialWeight = { id: '00000000-0000-4000-8000-000000000001', date: '2026-10-01', kg: 70 }

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.profiles, db.weights, async () => {
    await db.weights.clear()
    await db.profiles.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
}

beforeEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
  await createProfile({
    id: 'self', name: 'Синтетический профиль', heightCm: 170,
    birthDate: '2000-01-01', formulaSex: 'none',
  }, initialWeight)
})

afterEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
})

async function openWeightPage() {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Вес', exact: true }).click()
  await expect.element(page.getByRole('form', { name: 'Новое измерение' })).toBeVisible()
  expect(window.location.hash).toBe('#weight')
  return view
}

test('история веса поддерживает добавление, исправление, отмену и подтверждённое удаление', async () => {
  const view = await openWeightPage()
  expect((await axe.run(view.container)).violations).toEqual([])
  await page.getByLabelText('Дата измерения').fill('2026-10-02')
  await page.getByLabelText('Вес, кг').fill('69,5')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Измерение сохранено')
  await expect.element(page.getByRole('button', { name: 'Изменить вес за 02.10.2026' })).toBeVisible()
  const added = await db.weights.where('date').equals('2026-10-02').first()
  expect(added).toMatchObject({ date: '2026-10-02', kg: 69.5 })
  expect(await db.weights.count()).toBe(2)

  await page.getByLabelText('Дата измерения').fill('2026-10-02')
  await page.getByLabelText('Вес, кг').fill('69,25')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(page.getByText('69,25 кг', { exact: true })).toBeVisible()
  expect(await db.weights.where('date').equals('2026-10-02').first()).toEqual({ ...added, kg: 69.25 })
  expect(await db.weights.count()).toBe(2)

  await page.getByRole('button', { name: 'Изменить вес за 02.10.2026' }).click()
  await expect.element(page.getByRole('form', { name: 'Редактирование веса' })).toBeVisible()
  await expect.element(page.getByLabelText('Дата измерения')).toHaveValue('2026-10-02')
  await expect.element(page.getByLabelText('Вес, кг')).toHaveValue('69.25')
  await page.getByLabelText('Дата измерения').fill('2026-10-03')
  await page.getByLabelText('Вес, кг').fill('69,0')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(page.getByRole('button', { name: 'Изменить вес за 03.10.2026' })).toBeVisible()
  await expect.element(page.getByRole('button', { name: 'Изменить вес за 02.10.2026' })).not.toBeInTheDocument()
  expect(await db.weights.where('date').equals('2026-10-03').first()).toEqual({ ...added, date: '2026-10-03', kg: 69 })
  const saved = await db.weights.toArray()

  await page.getByRole('button', { name: 'Изменить вес за 03.10.2026' }).click()
  await page.getByLabelText('Дата измерения').fill('2026-10-04')
  await page.getByLabelText('Вес, кг').fill('99')
  await page.getByRole('button', { name: 'Отменить изменение' }).click()
  await expect.element(page.getByRole('form', { name: 'Новое измерение' })).toBeVisible()
  expect(await db.weights.toArray()).toEqual(saved)

  const remove = page.getByRole('button', { name: 'Удалить вес за 03.10.2026' })
  await remove.click()
  await expect.element(page.getByRole('alertdialog', { name: 'Удалить измерение за 03.10.2026?' })).toBeVisible()
  await expect.element(page.getByRole('button', { name: 'Отмена', exact: true })).toHaveFocus()
  expect((await axe.run(view.container)).violations).toEqual([])
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument()
  await expect.element(remove).toHaveFocus()
  expect(await db.weights.toArray()).toEqual(saved)
  await remove.click()
  await page.getByRole('button', { name: 'Подтвердить удаление' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Измерение удалено')
  await expect.element(page.getByRole('button', { name: 'Удалить вес за 03.10.2026' })).not.toBeInTheDocument()
  expect(await db.weights.toArray()).toEqual([initialWeight])

  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByRole('button', { name: 'Изменить вес за 01.10.2026' })).toBeVisible()
  expect(await db.weights.toArray()).toEqual([initialWeight])
  expect((await axe.run(reopened.container)).violations).toEqual([])
}, 15000)

test('мобильная форма отклоняет будущую дату и нулевой вес с фокусом ошибки', async () => {
  await page.viewport(375, 812)
  const view = await openWeightPage()
  await page.getByLabelText('Дата измерения').fill('2099-01-01')
  await page.getByLabelText('Вес, кг').fill('69,5')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Проверьте отмеченные поля')
  await expect.element(page.getByLabelText('Дата измерения')).toHaveAccessibleDescription('Дата измерения не может быть в будущем')
  await expect.element(page.getByLabelText('Дата измерения')).toHaveFocus()
  await page.getByLabelText('Дата измерения').fill('2026-10-02')
  await page.getByLabelText('Вес, кг').fill('0')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(page.getByLabelText('Вес, кг')).toHaveAccessibleDescription('Вес должен быть больше нуля')
  await expect.element(page.getByLabelText('Вес, кг')).toHaveFocus()
  expect(await db.weights.toArray()).toEqual([initialWeight])
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
})

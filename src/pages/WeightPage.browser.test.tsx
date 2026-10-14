import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
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
  await db.transaction('rw', [db.metadata, db.profiles, db.weights, db.products, db.foodEntries, db.nutritionDays, db.steps, db.workouts, db.energyPlans], async () => {
    await db.metadata.clear()
    await db.weights.clear()
    await db.profiles.clear()
    await db.products.clear()
    await db.foodEntries.clear()
    await db.nutritionDays.clear()
    await db.steps.clear()
    await db.workouts.clear()
    await db.energyPlans.clear()
  })
  window.history.replaceState(null, '', window.location.pathname)
}

beforeEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'))
  await createProfile({
    id: 'self', name: 'Синтетический профиль', heightCm: 170,
    birthDate: '2000-01-01', formulaSex: 'none',
  }, initialWeight)
})

afterEach(async () => {
  await resetTestState()
  await page.viewport(1280, 800)
  vi.useRealTimers()
})

async function openWeightPage() {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Вес', exact: true }).click()
  await expect.element(page.getByRole('form', { name: 'Новое измерение' })).toBeVisible()
  expect(window.location.hash).toBe('#weight')
  return view
}

async function expectChart(from: string, to: string, minimum: number, maximum: number) {
  const chart = page.getByRole('region', { name: 'График веса', exact: true })
  const range = `${String(minimum).replace('.', ',')}–${String(maximum).replace('.', ',')}`
  await expect.element(chart.getByRole('img', { name: 'График веса', exact: true }))
    .toHaveAccessibleDescription(`Измерения от ${from} до ${to}; диапазон ${range} кг. Все числа доступны в истории измерений ниже.`)
  await expect.element(chart.getByText(`Период: ${from} — ${to}.`, { exact: true })).toBeVisible()
  await expect.element(chart.getByText(`Диапазон шкалы: ${range} кг. Шкала адаптирована к измерениям и может не начинаться с нуля.`, { exact: true })).toBeVisible()
}

function expectNoExternalRequests() {
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}

test('история веса поддерживает добавление, исправление, отмену и подтверждённое удаление', async () => {
  const view = await openWeightPage()
  await expectChart('01.10.2026', '01.10.2026', 70, 70)
  expect((await axe.run(view.container)).violations).toEqual([])
  await page.getByLabelText('Дата измерения').fill('2026-10-02')
  await page.getByLabelText('Вес, кг').fill('69,5')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Измерение сохранено')
  await expect.element(page.getByRole('button', { name: 'Изменить вес за 02.10.2026' })).toBeVisible()
  const added = await db.weights.where('date').equals('2026-10-02').first()
  expect(added).toMatchObject({ date: '2026-10-02', kg: 69.5 })
  expect(await db.weights.count()).toBe(2)
  await expectChart('01.10.2026', '02.10.2026', 69.5, 70)

  await page.getByLabelText('Дата измерения').fill('2026-10-02')
  await page.getByLabelText('Вес, кг').fill('69,25')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(page.getByText('69,25 кг', { exact: true })).toBeVisible()
  expect(await db.weights.where('date').equals('2026-10-02').first()).toEqual({ ...added, kg: 69.25 })
  expect(await db.weights.count()).toBe(2)
  await expectChart('01.10.2026', '02.10.2026', 69.25, 70)

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
  await expectChart('01.10.2026', '03.10.2026', 69, 70)

  await page.getByRole('button', { name: 'Изменить вес за 03.10.2026' }).click()
  await page.getByLabelText('Дата измерения').fill('2026-10-04')
  await page.getByLabelText('Вес, кг').fill('99')
  await page.getByRole('button', { name: 'Отменить изменение' }).click()
  await expect.element(page.getByRole('form', { name: 'Новое измерение' })).toBeVisible()
  expect(await db.weights.toArray()).toEqual(saved)
  await expectChart('01.10.2026', '03.10.2026', 69, 70)

  const remove = page.getByRole('button', { name: 'Удалить вес за 03.10.2026' })
  await remove.click()
  await expect.element(page.getByRole('alertdialog', { name: 'Удалить измерение за 03.10.2026?' })).toBeVisible()
  await expect.element(page.getByRole('button', { name: 'Отмена', exact: true })).toHaveFocus()
  expect((await axe.run(view.container)).violations).toEqual([])
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument()
  await expect.element(remove).toHaveFocus()
  expect(await db.weights.toArray()).toEqual(saved)
  await remove.click()
  await page.getByRole('button', { name: 'Подтвердить удаление' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Измерение удалено')
  await expect.element(page.getByRole('button', { name: 'Удалить вес за 03.10.2026' })).not.toBeInTheDocument()
  expect(await db.weights.toArray()).toEqual([initialWeight])
  await expectChart('01.10.2026', '01.10.2026', 70, 70)

  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByRole('button', { name: 'Изменить вес за 01.10.2026' })).toBeVisible()
  expect(await db.weights.toArray()).toEqual([initialWeight])
  await expectChart('01.10.2026', '01.10.2026', 70, 70)
  expect((await axe.run(reopened.container)).violations).toEqual([])
  expectNoExternalRequests()
}, 15000)

test('мобильная форма отклоняет будущую дату и нулевой вес с фокусом ошибки', async () => {
  await page.viewport(375, 812)
  const view = await openWeightPage()
  await expectChart('01.10.2026', '01.10.2026', 70, 70)
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
  await page.getByLabelText('Вес, кг').fill('70')
  await userEvent.keyboard('{Tab}')
  await expect.element(page.getByRole('button', { name: 'Сохранить вес' })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expectChart('01.10.2026', '02.10.2026', 70, 70)
  expect(await db.weights.count()).toBe(2)
  expect((await axe.run(view.container)).violations).toEqual([])
  await page.getByRole('button', { name: 'Удалить вес за 02.10.2026', exact: true }).click()
  await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expectChart('01.10.2026', '01.10.2026', 70, 70)
  await page.getByRole('button', { name: 'Удалить вес за 01.10.2026', exact: true }).click()
  await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  const chart = page.getByRole('region', { name: 'График веса', exact: true })
  await expect.element(chart.getByText('Для графика нужны измерения веса.', { exact: true })).toBeVisible()
  await expect.element(chart.getByRole('img', { name: 'График веса', exact: true })).not.toBeInTheDocument()
  await expect.element(page.getByText('Измерений пока нет. Отсутствие записи не означает нулевой вес.', { exact: true })).toBeVisible()
  expect(await db.weights.count()).toBe(0)
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
  expectNoExternalRequests()
})

test('карточка ИМТ обновляется после изменения веса и учитывает отсутствие возраста', async () => {
  const view = await openWeightPage()
  const card = page.getByRole('region', { name: 'ИМТ (справочно)' })
  await expect.element(card.getByText('24,2', { exact: true })).toBeVisible()
  await expect.element(card.getByRole('link', { name: 'Источник и ограничения CDC' }))
    .toHaveAttribute('href', 'https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html')
  await expect.element(card.getByText(/Это не диагноз и не оценка состава тела/)).toBeVisible()

  await page.getByLabelText('Дата измерения').fill(initialWeight.date)
  await page.getByLabelText('Вес, кг').fill('85')
  await page.getByRole('button', { name: 'Сохранить вес' }).click()
  await expect.element(card.getByText('29,4', { exact: true })).toBeVisible()
  await expect.element(card.getByText(/Справочная категория CDC: От 25 до 30/)).toBeVisible()

  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await page.getByRole('button', { name: 'Редактировать профиль' }).click()
  await page.getByLabelText('Дата рождения (необязательно)').fill('')
  await page.getByRole('button', { name: 'Сохранить профиль' }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Профиль обновлён')
  await page.getByRole('link', { name: 'Вес', exact: true }).click()
  await expect.element(card.getByText('29,4', { exact: true })).toBeVisible()
  await expect.element(card.getByText('Взрослая категория доступна с 20 лет при известной дате рождения.')).toBeVisible()
  await expect.element(card.getByText(/Справочная категория CDC:/)).not.toBeInTheDocument()
  expect(await db.weights.count()).toBe(1)
  expect((await axe.run(view.container)).violations).toEqual([])
  expectNoExternalRequests()
})

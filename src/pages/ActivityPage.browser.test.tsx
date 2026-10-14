import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import '../styles.css'

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', [db.steps, db.foodEntries, db.products, db.nutritionDays, db.metadata], async () => {
    await db.steps.clear()
    await db.foodEntries.clear()
    await db.products.clear()
    await db.nutritionDays.clear()
    await db.metadata.clear()
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

async function expectMobilePage(container: HTMLElement) {
  expect(window.innerWidth).toBe(375)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(container)).violations).toEqual([])
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
}

test('шаги сохраняют явный ноль и обновляют выбранный день, общий с питанием, после remount', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  await expect.element(page.getByRole('heading', { level: 1, name: 'Активность', exact: true })).toBeVisible()
  expect(window.location.hash).toBe('#activity')
  const input = page.getByLabelText('Шаги за день', { exact: true })
  const save = page.getByRole('button', { name: 'Сохранить шаги', exact: true })
  await expect.element(page.getByText('Шаги за этот день: нет данных', { exact: true })).toBeVisible()
  await expect.element(input).toHaveValue('')
  await expect.element(page.getByRole('button', { name: 'Удалить итог шагов' })).not.toBeInTheDocument()
  expect(await db.steps.count()).toBe(0)

  await page.getByLabelText('День дневника').fill('2026-10-01')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await input.fill('0')
  await expect.element(input).toHaveFocus()
  await userEvent.keyboard('{Tab}')
  await expect.element(save).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('status')).toHaveTextContent('Итог шагов сохранён')
  await expect.element(page.getByText('Шаги за этот день: 0', { exact: true })).toBeVisible()
  expect(await db.steps.toArray()).toEqual([{ date: '2026-10-01', count: 0 }])
  await input.fill('1200')
  await save.click()
  await expect.element(page.getByText('Шаги за этот день: 1 200', { exact: true })).toBeVisible()
  expect(await db.steps.toArray()).toEqual([{ date: '2026-10-01', count: 1200 }])

  await page.getByLabelText('День дневника').fill('2026-10-02')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect.element(page.getByText('Шаги за этот день: нет данных', { exact: true })).toBeVisible()
  await expect.element(input).toHaveValue('')
  await input.fill('7')
  await save.click()
  await expect.element(page.getByText('Шаги за этот день: 7', { exact: true })).toBeVisible()
  const saved = [{ date: '2026-10-01', count: 1200 }, { date: '2026-10-02', count: 7 }]
  expect(await db.steps.toArray()).toEqual(saved)
  await page.getByRole('link', { name: 'Питание', exact: true }).click()
  await expect.element(page.getByLabelText('День дневника')).toHaveValue('2026-10-02')
  await expect.element(page.getByText('Еда за 02.10.2026', { exact: true })).toBeVisible()
  await page.getByLabelText('День дневника').fill('2026-10-01')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect.element(page.getByText('Еда за 01.10.2026', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  await expect.element(page.getByLabelText('День дневника')).toHaveValue('2026-10-01')
  await expect.element(input).toHaveValue('1200')

  await view.unmount()
  const reopened = await render(<App />)
  await expect.element(page.getByLabelText('День дневника')).toHaveValue('2026-10-14')
  await expect.element(page.getByText('Шаги за этот день: нет данных', { exact: true })).toBeVisible()
  await page.getByLabelText('День дневника').fill('2026-10-01')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect.element(input).toHaveValue('1200')
  await expect.element(page.getByText('Шаги за этот день: 1 200', { exact: true })).toBeVisible()
  await page.getByLabelText('День дневника').fill('2026-10-02')
  await page.getByRole('button', { name: 'Открыть день' }).click()
  await expect.element(input).toHaveValue('7')
  expect(await db.steps.toArray()).toEqual(saved)
  await expectMobilePage(reopened.container)
}, 15000)

test('неверные шаги сохраняют прежний итог, а удаление требует подтверждения и возвращает фокус в пустое поле', async () => {
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  const input = page.getByLabelText('Шаги за день', { exact: true })
  const save = page.getByRole('button', { name: 'Сохранить шаги', exact: true })
  await input.fill('600')
  await save.click()
  await expect.element(page.getByText('Шаги за этот день: 600', { exact: true })).toBeVisible()
  const saved = [{ date: '2026-10-14', count: 600 }]
  const invalid = [
    { value: '', error: 'Введите число без разделителей тысяч' },
    { value: '0,5', error: 'Введите целое число шагов' },
    { value: '-1', error: 'Шаги не могут быть отрицательными' },
    { value: '1000001', error: 'Технический предел: 1 000 000 шагов' },
  ]
  for (const item of invalid) {
    await input.fill(item.value)
    await save.click()
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await expect.element(input).toHaveAccessibleDescription(item.error)
    await expect.element(input).toHaveFocus()
    await expect.element(page.getByText('Шаги за этот день: 600', { exact: true })).toBeVisible()
    expect(await db.steps.toArray()).toEqual(saved)
  }
  const remove = page.getByRole('button', { name: 'Удалить итог шагов', exact: true })
  const dialog = page.getByRole('alertdialog', { name: 'Удалить итог шагов за 2026-10-14?', exact: true })
  await remove.click()
  await expect.element(dialog).toBeVisible()
  await expect.element(dialog.getByRole('button', { name: 'Отмена', exact: true })).toHaveFocus()
  expect((await axe.run(view.container)).violations).toEqual([])
  await userEvent.keyboard('{Enter}')
  await expect.element(dialog).not.toBeInTheDocument()
  await expect.element(remove).toHaveFocus()
  expect(await db.steps.toArray()).toEqual(saved)
  await remove.click()
  await dialog.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect.element(page.getByRole('status')).toHaveTextContent('Итог шагов удалён')
  await expect.element(page.getByText('Шаги за этот день: нет данных', { exact: true })).toBeVisible()
  await expect.element(input).toHaveValue('')
  await expect.element(input).toHaveAttribute('aria-invalid', 'false')
  await expect.element(input).toHaveFocus()
  await expect.element(remove).not.toBeInTheDocument()
  expect(await db.steps.count()).toBe(0)
  await expectMobilePage(view.container)
}, 15000)

import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import '../styles.css'

vi.mock('../domain/backup', async importOriginal => ({ ...await importOriginal<typeof import('../domain/backup')>(), BACKUP_MAX_RECORDS: 3 }))

async function resetTestState() {
  await cleanup()
  expect(import.meta.env.MODE).toBe('test')
  expect(db.name).toBe('health-diary-tests')
  await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear() })
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
  vi.useRealTimers()
  await page.viewport(1280, 800)
  const externalRequests = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url =>
    ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin,
  )
  expect(externalRequests).toEqual([])
})
async function openDay(date: string) {
  await page.getByLabelText('День дневника', { exact: true }).fill(date)
  await page.getByRole('button', { name: 'Открыть день', exact: true }).click()
  await expect.element(page.getByText(`Открыт день: ${date.split('-').reverse().join('.')}`, { exact: true })).toBeVisible()
}

test('новая дата при лимите шагов сохраняет черновик и историю, правка существующего дня на ноль остаётся доступной', async () => {
  let view = await render(<App />)
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  const input = page.getByLabelText('Шаги за день', { exact: true })
  const save = page.getByRole('button', { name: 'Сохранить шаги', exact: true })
  const records = [{ date: '2026-10-01', count: 10 }, { date: '2026-10-02', count: 20 }, { date: '2026-10-03', count: 30 }]
  for (const record of records) {
    await openDay(record.date)
    await expect.element(input).toHaveValue('')
    await input.fill(String(record.count))
    await save.click()
    await expect.element(page.getByText(`Шаги за этот день: ${String(record.count)}`, { exact: true })).toBeVisible()
  }
  expect(await db.steps.toArray()).toEqual(records)
  await openDay('2026-10-04')
  await input.fill('400')
  await save.click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Достигнут лимит записей раздела (3). Новые записи не сохранены.')
  await expect.element(input).toHaveValue('400')
  await expect.element(save).toBeEnabled()
  await expect.element(page.getByText('Шаги за этот день: нет данных', { exact: true })).toBeVisible()
  expect(await db.steps.toArray()).toEqual(records)
  expect(await db.steps.get('2026-10-04')).toBeUndefined()
  expect((await axe.run(view.container)).violations).toEqual([])
  await openDay('2026-10-02')
  await expect.element(input).toHaveValue('20')
  await input.fill('0')
  await save.click()
  await expect.element(page.getByText('Шаги за этот день: 0', { exact: true })).toBeVisible()
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  const updated = records.map(record => record.date === '2026-10-02' ? { ...record, count: 0 } : record)
  expect(await db.steps.toArray()).toEqual(updated)
  expect(await db.steps.count()).toBe(3)
  await view.unmount()
  view = await render(<App />)
  await expect.element(page.getByRole('heading', { name: 'Активность', level: 1, exact: true })).toBeVisible()
  await openDay('2026-10-02')
  await expect.element(input).toHaveValue('0')
  await expect.element(page.getByText('Шаги за этот день: 0', { exact: true })).toBeVisible()
  expect(await db.steps.toArray()).toEqual(updated)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

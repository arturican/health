import { expect, test } from './fixtures'
import axe from 'axe-core'

test.use({ timezoneId: 'Europe/Moscow' })

test('график выбирает измерения кликом, касанием и клавиатурой и обновляется после правок истории', async ({ page, baseURL, hasTouch }) => {
  test.setTimeout(60000)
  const errors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    const url = new URL(request.url())
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== baseURL) externalRequests.push(request.url())
  })
  await page.clock.setFixedTime(new Date('2026-10-14T12:00:00Z'))
  await page.goto('/')
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await page.getByLabel('Имя (необязательно)', { exact: true }).fill('Синтетический график веса')
  await page.getByLabel('Рост, см', { exact: true }).fill('170')
  await page.getByLabel('Вес, кг', { exact: true }).fill('72')
  await page.getByLabel('Дата первого измерения', { exact: true }).fill('2026-10-01')
  await page.getByRole('button', { name: 'Создать профиль', exact: true }).click()
  await expect(page.getByText('Синтетический график веса', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Вес', exact: true }).click()

  const history = page.getByRole('list', { name: 'История веса', exact: true })
  const measurements = [
    ['2026-10-02', '71,5'],
    ['2026-10-10', '70,25'],
    ['2026-10-14', '70'],
  ] as const
  for (const [index, [date, kg]] of measurements.entries()) {
    const form = page.getByRole('form', { name: 'Новое измерение', exact: true })
    await form.getByLabel('Дата измерения', { exact: true }).fill(date)
    await form.getByLabel('Вес, кг', { exact: true }).fill(kg)
    await form.getByRole('button', { name: 'Сохранить вес', exact: true }).click()
    await expect(history.getByRole('listitem')).toHaveCount(index + 2)
  }

  const chart = page.getByRole('region', { name: 'График веса', exact: true })
  const readout = chart.getByRole('status', { name: 'Выбранное измерение', exact: true })
  const select = chart.getByLabel('Измерение на графике', { exact: true })
  const interaction = chart.getByRole('button', { name: 'Выбрать измерение на графике', exact: true })
  async function expectSelection(kg: string, date: string) {
    await expect(readout).toContainText(`${kg} кг`)
    await expect(readout).toContainText(date)
  }
  await expect(chart.getByRole('img', { name: 'График веса', exact: true })).toHaveAccessibleDescription(
    'Измерения от 01.10.2026 до 14.10.2026; диапазон 70–72 кг. Все числа доступны в истории измерений ниже.',
  )
  await expectSelection('70', '14.10.2026')
  await interaction.scrollIntoViewIfNeeded()
  const bounds = await interaction.boundingBox()
  if (!bounds) throw new Error('Поверхность выбора измерения должна быть видима')
  const position = { x: bounds.width * 40 / 600, y: bounds.height / 2 }
  if (hasTouch) await interaction.tap({ position })
  else await interaction.click({ position })
  await expectSelection('72', '01.10.2026')
  const right = { x: bounds.width * 560 / 600, y: bounds.height / 2 }
  if (hasTouch) await interaction.tap({ position: right })
  else await interaction.click({ position: right })
  await expectSelection('70', '14.10.2026')

  await interaction.focus()
  for (const [key, kg, date] of [
    ['End', '70', '14.10.2026'],
    ['Home', '72', '01.10.2026'],
    ['ArrowRight', '71,5', '02.10.2026'],
    ['ArrowLeft', '72', '01.10.2026'],
    ['ArrowLeft', '72', '01.10.2026'],
  ] as const) {
    await page.keyboard.press(key)
    await expectSelection(kg, date)
    await expect(interaction).toBeFocused()
  }
  await select.selectOption({ label: '10.10.2026 — 70,25 кг' })
  await expectSelection('70,25', '10.10.2026')

  await history.getByRole('button', { name: 'Изменить вес за 10.10.2026', exact: true }).click()
  const editor = page.getByRole('form', { name: 'Редактирование веса', exact: true })
  await editor.getByLabel('Дата измерения', { exact: true }).fill('2026-10-09')
  await editor.getByLabel('Вес, кг', { exact: true }).fill('69,75')
  await editor.getByRole('button', { name: 'Сохранить вес', exact: true }).click()
  await expectSelection('69,75', '09.10.2026')
  await expect(readout).not.toContainText('70,25')
  await expect(select.getByRole('option', { name: '10.10.2026 — 70,25 кг', exact: true })).toHaveCount(0)
  await history.getByRole('button', { name: 'Удалить вес за 09.10.2026', exact: true }).click()
  await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect(history.getByRole('listitem')).toHaveCount(3)
  await expectSelection('70', '14.10.2026')
  await expect(readout).not.toContainText('69,75')
  await expect(select.getByRole('option', { name: '09.10.2026 — 69,75 кг', exact: true })).toHaveCount(0)

  await page.addScriptTag({ content: axe.source })
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 812 })
    await interaction.scrollIntoViewIfNeeded()
    await expect(chart.getByRole('img', { name: 'График веса', exact: true })).toBeVisible()
    await select.selectOption({ label: '02.10.2026 — 71,5 кг' })
    await expectSelection('71,5', '02.10.2026')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(async () => (await window.axe.run(document)).violations)).toEqual([])
  }
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})

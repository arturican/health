import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-react'
import axe from 'axe-core'
import { App } from '../App'
import { db } from '../data/db'
import { addPhoto } from '../data/photoRepository'
import { saveSteps } from '../data/stepsRepository'
import { addWorkout } from '../data/workoutRepository'
import '../styles.css'

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
function failDeletion() { throw new DOMException('synthetic-private-deletion-failure', 'QuotaExceededError') }
async function expectFailedDeletion() {
  await expect.element(page.getByRole('alert')).toHaveTextContent('Не удалось выполнить действие')
  await expect.element(page.getByRole('alert')).not.toHaveTextContent('synthetic-private-deletion-failure')
  await expect.element(page.getByRole('alertdialog')).toBeVisible()
  await expect.element(page.getByRole('alertdialog').getByRole('button', { name: 'Отмена', exact: true })).toHaveFocus()
}
async function syntheticPhoto() {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 16
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Нужен Canvas для синтетической геометрии')
  context.fillStyle = '#0b57d0'
  context.fillRect(0, 0, 32, 16)
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Синтетический PNG не создан')) }, 'image/png')
  })
  return addPhoto({ date: '2026-10-14', title: 'Синтетическая геометрия для удаления', note: '' }, png)
}

test('ошибка удаления фото возвращает фокус отмене, сохраняет файл и черновик, повтор удаляет фото', async () => {
  const photo = await syntheticPhoto()
  const fileBefore = await db.files.get(photo.fileId)
  if (!fileBefore) throw new Error('Нужен сохранённый файл синтетического фото')
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Фото', exact: true }).click()
  const draft = page.getByLabelText('Подпись фото', { exact: true })
  await draft.fill('Синтетический новый черновик фото')
  const remove = page.getByRole('button', { name: /^Удалить фото 1:/ })
  await remove.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect.element(remove).toHaveFocus()
  await expect.element(draft).toHaveValue('Синтетический новый черновик фото')
  expect(await db.photos.get(photo.id)).toEqual(photo)
  await remove.click()
  db.photos.hook('deleting', failDeletion)
  try {
    await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
    await expectFailedDeletion()
    expect(await db.photos.get(photo.id)).toEqual(photo)
    const fileAfter = await db.files.get(photo.fileId)
    if (!fileAfter) throw new Error('Отказ удаления должен сохранить файл')
    expect(new Uint8Array(await fileAfter.blob.arrayBuffer())).toEqual(new Uint8Array(await fileBefore.blob.arrayBuffer()))
    await expect.element(draft).toHaveValue('Синтетический новый черновик фото')
  } finally { db.photos.hook('deleting').unsubscribe(failDeletion) }
  await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument()
  await expect.element(page.getByText('Фотографий пока нет.', { exact: true })).toBeVisible()
  expect(await db.photos.get(photo.id)).toBeUndefined()
  expect(await db.files.get(photo.fileId)).toBeUndefined()
  await expect.element(draft).toHaveValue('Синтетический новый черновик фото')
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

test('ошибка удаления шагов возвращает фокус отмене и сохраняет итог и ввод до успешного повтора', async () => {
  await saveSteps({ date: '2026-10-14', count: 2400 })
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  const draft = page.getByLabelText('Шаги за день', { exact: true })
  await draft.fill('3456')
  await page.getByRole('button', { name: 'Удалить итог шагов', exact: true }).click()
  db.steps.hook('deleting', failDeletion)
  try {
    await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
    await expectFailedDeletion()
    expect(await db.steps.get('2026-10-14')).toEqual({ date: '2026-10-14', count: 2400 })
    await expect.element(draft).toHaveValue('3456')
  } finally { db.steps.hook('deleting').unsubscribe(failDeletion) }
  await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument()
  await expect.element(page.getByText('Шаги за этот день: нет данных', { exact: true })).toBeVisible()
  expect(await db.steps.get('2026-10-14')).toBeUndefined()
  await expect.element(draft).toHaveValue('')
  await expect.element(draft).toHaveFocus()
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

test('ошибка удаления тренировки возвращает фокус отмене и сохраняет запись и новый черновик', async () => {
  const workout = await addWorkout({ date: '2026-10-14', kind: 'Синтетическая прогулка для удаления', minutes: 30, kcal: null, source: '', note: '' })
  const view = await render(<App />)
  await page.getByRole('link', { name: 'Активность', exact: true }).click()
  const draft = page.getByLabelText('Вид тренировки', { exact: true })
  await draft.fill('Синтетический новый черновик тренировки')
  await page.getByLabelText('Длительность, мин', { exact: true }).fill('15,5')
  const remove = page.getByRole('button', { name: /^Удалить тренировку 1:/ })
  await remove.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect.element(remove).toHaveFocus()
  await expect.element(draft).toHaveValue('Синтетический новый черновик тренировки')
  expect(await db.workouts.get(workout.id)).toEqual(workout)
  await remove.click()
  db.workouts.hook('deleting', failDeletion)
  try {
    await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
    await expectFailedDeletion()
    expect(await db.workouts.get(workout.id)).toEqual(workout)
    await expect.element(draft).toHaveValue('Синтетический новый черновик тренировки')
    await expect.element(page.getByLabelText('Длительность, мин', { exact: true })).toHaveValue('15,5')
  } finally { db.workouts.hook('deleting').unsubscribe(failDeletion) }
  await page.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click()
  await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument()
  await expect.element(page.getByText('За этот день нет записей тренировок.', { exact: true })).toBeVisible()
  expect(await db.workouts.get(workout.id)).toBeUndefined()
  await expect.element(draft).toHaveValue('Синтетический новый черновик тренировки')
  await expect.element(draft).toHaveFocus()
  expect((await axe.run(view.container)).violations).toEqual([])
}, 15000)

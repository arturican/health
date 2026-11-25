import { createHash, randomUUID } from 'node:crypto'
import { open, readFile, stat } from 'node:fs/promises'
import { test, expect } from '../e2e/fixtures'
import { createPool } from '../../src/server/database'
import { createAccount, type Account } from '../../src/server/accounts'
import { withUser } from '../../src/server/userTransaction'
import { ensureDiaryState } from '../../src/server/diaryState'
import { prepareFullImport } from '../../src/server/prepareFullImport'
import { replaceFullSnapshot } from '../../src/server/restoreFull'
import { readFullSnapshot } from '../../src/server/fullSnapshot'
import { readFullBackup, FULL_BACKUP_MAX_BYTES, type FullBackup } from '../../src/domain/fullBackup'
import { yearBackupFixture, YEAR_TODAY } from './yearBackupFixture'

const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

// Compare content and every attachment without keeping additional Base64 copies.
function fingerprint(backup: FullBackup) {
  const text = { ...backup.text, exportedAt: '' }
  const records = { ...text, metadata: backup.metadata.filter(row => row.id !== 'diary-generation')
    .map(row => row.id === 'section-visibility' ? { ...row, value: JSON.stringify(JSON.parse(row.value)) } : row),
    photos: backup.photos, documents: backup.documents, labResults: backup.labResults,
    files: backup.files.map(({ base64, ...file }) => ({ ...file, sha256: hash(Buffer.from(base64, 'base64')) })) }
  return Object.fromEntries(Object.entries(records).map(([key, value]) => [
    key, Array.isArray(value) ? value.map(item => JSON.stringify(item)).sort() : value,
  ]))
}

test.use({ timezoneId: 'Europe/Moscow' })

test('год и 100 МиБ проходят полный перенос и безопасный отказ', async ({ page, context, account: credentials }, info) => {
  const account: Account = { id: credentials.id, login: credentials.login, timezone: credentials.timezone }
  const adminUrl = process.env['HEALTH_E2E_ADMIN_URL']
  const runtimeUrl = process.env['HEALTH_E2E_RUNTIME_URL']
  for (const value of [adminUrl, runtimeUrl]) {
    if (!value || !/^\/health_test_[a-f0-9]{32}$/.test(new URL(value).pathname)) throw new Error('Нужна тестовая БД')
  }
  const admin = createPool(adminUrl), runtime = createPool(runtimeUrl)
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  const snapshot = async (owner: Account) => fingerprint(await withUser(runtime, owner,
    client => readFullSnapshot(client, YEAR_TODAY, YEAR_TODAY + 'T12:00:00.000Z')))
  const revision = async (owner: Account) => (await admin.query(
    'SELECT generation,change_revision FROM health.settings WHERE user_id=$1', [owner.id])).rows.map((row: unknown) => row)
  try {
    let fixture: FullBackup | null = await yearBackupFixture()
    expect([fixture.text.weights.length, fixture.text.products.length, fixture.text.foodEntries.length,
      fixture.text.nutritionDays.length, fixture.text.steps.length, fixture.text.workouts.length,
      fixture.text.energyPlans.length, fixture.photos.length, fixture.documents.length, fixture.labResults.length,
      fixture.files.length]).toEqual([123, 15, 4417, 346, 343, 122, 3, 52, 24, 72, 76])
    expect(fixture.files.reduce((sum, file) => sum + file.size, 0)).toBe(104857600)
    const expected = fingerprint(fixture)
    const foreignFileId = fixture.files[0]?.id
    const prepared = await prepareFullImport(fixture, YEAR_TODAY)
    await withUser(runtime, account, async client => {
      await ensureDiaryState(client, account.id)
      await replaceFullSnapshot(client, account.id, prepared)
    }, true)
    fixture = null
    const sourceBefore = await snapshot(account)
    expect(sourceBefore).toEqual(expected)
    const sourceRevision = await revision(account)

    await page.clock.setFixedTime(new Date(YEAR_TODAY + 'T12:00:00Z'))
    await page.goto('/#settings')
    const downloadStart = performance.now()
    const event = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Скачать полную копию', exact: true }).click()
    const download = await event
    const path = info.outputPath('year-full.json')
    await download.saveAs(path)
    expect(await download.failure()).toBeNull()
    const downloadMs = Math.round(performance.now() - downloadStart)
    expect(fingerprint(readFullBackup(JSON.parse(await readFile(path, 'utf8')), YEAR_TODAY))).toEqual(expected)
    const bytes = (await stat(path)).size
    expect(bytes).toBeLessThanOrEqual(FULL_BACKUP_MAX_BYTES)

    const password = 'synthetic-year-backup-password'
    const target = await createAccount(admin, { login: 'year-' + randomUUID().slice(0, 8),
      password, timezone: 'Europe/Moscow' })
    await page.getByRole('button', { name: 'Выйти', exact: true }).click()
    await page.getByLabel('Почта', { exact: true }).fill(target.login)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Разделы дневника' })).toBeVisible()
    expect((await context.request.get('/api/v1/files/' + String(foreignFileId))).status()).toBe(404)
    await page.goto('/#settings')
    const input = page.getByLabel('Файл полной копии', { exact: true })
    await input.setInputFiles(path)
    const previewStart = performance.now()
    await page.getByRole('button', { name: 'Проверить полную копию', exact: true }).click()
    const preview = page.getByRole('region', { name: 'Предпросмотр полной копии', exact: true })
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('Файлов: 76. Размер вложений: 104857600 байт.')
    const previewMs = Math.round(performance.now() - previewStart)
    await preview.getByRole('checkbox').check()
    const importStart = performance.now()
    const importing = page.waitForResponse(response => response.url().endsWith('/api/v1/backup/full')
      && response.request().method() === 'POST')
    await preview.getByRole('button', { name: 'Восстановить полную копию', exact: true }).click()
    expect((await importing).status()).toBe(200)
    await expect(page.getByText('Полная копия восстановлена', { exact: true })).toBeVisible()
    const importMs = Math.round(performance.now() - importStart)
    expect(await snapshot(target)).toEqual(expected)
    expect(await snapshot(account)).toEqual(sourceBefore)
    expect(await revision(account)).toEqual(sourceRevision)

    const beforeBoundary = await revision(target)
    const oversized = info.outputPath('oversized-full.json')
    const file = await open(oversized, 'w')
    try { await file.truncate(FULL_BACKUP_MAX_BYTES + 1) } finally { await file.close() }
    let importRequests = 0
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/backup/full')) importRequests++
    })
    await input.setInputFiles(oversized)
    await page.getByRole('button', { name: 'Проверить полную копию', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Полная копия превышает 200 MiB')
    await expect(preview).not.toBeVisible()
    expect(importRequests).toBe(0)
    expect(await revision(target)).toEqual(beforeBoundary)
    expect(await snapshot(target)).toEqual(expected)
    expect(browserErrors).toEqual([])
    console.log(JSON.stringify({ project: info.project.name, bytes, downloadMs, previewMs, importMs,
      attachmentBytes: 104857600, files: 76, boundaryBytes: FULL_BACKUP_MAX_BYTES + 1 }))
  } finally {
    await runtime.end()
    await admin.end()
  }
})

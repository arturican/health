import type { Pool } from 'pg'
import { z } from 'zod'
import { accountSchema, createAccount, loginSchema, passwordSchema, timezoneSchema } from './accounts.js'
import { assertRuntimeRole } from './auth.js'
import { demoBackup } from './demoBackup.js'
import { prepareFullImport } from './prepareFullImport.js'
import { replaceFullSnapshot } from './restoreFull.js'
import { assertImportTarget } from './restoreText.js'
import { ensureDiaryState } from './diaryState.js'
import { withUser } from './userTransaction.js'
import { diaryDate } from './recordValidation.js'
import { DataError } from './httpErrors.js'

export async function seedDemo(admin: Pool, runtime: Pool, input: unknown, now = new Date()) {
  const values = z.strictObject({ login: loginSchema, password: passwordSchema.optional(), timezone: timezoneSchema }).parse(input)
  await assertRuntimeRole(runtime)
  const lookup = async () => {
    const rows = await admin.query<Record<string, unknown>>('SELECT id,login,timezone FROM health.users WHERE login=$1', [values.login])
    return rows.rows[0] ? accountSchema.parse(rows.rows[0]) : null
  }
  let account = await lookup()
  if (!account) {
    try { account = await createAccount(admin, values) }
    catch (error) {
      // Другой запуск мог создать тот же логин; пароль существующего не меняем.
      account = await lookup()
      if (!account) throw error
    }
  }
  if (account.timezone !== values.timezone) throw new Error('Часовой пояс существующего аккаунта отличается')
  const owner = account, today = diaryDate(owner.timezone, now)
  const prepared = await prepareFullImport(await demoBackup(today), today)
  const seeded = await withUser(runtime, owner, async client => {
    await ensureDiaryState(client, owner.id)
    const marker = await client.query('SELECT 1 FROM health.legacy_metadata WHERE id=$1', ['demo-seed-v1'])
    if (marker.rowCount) return false
    await assertImportTarget(client, 'empty')
    await replaceFullSnapshot(client, owner.id, prepared)
    const result = await client.query('UPDATE health.settings SET change_revision=change_revision+1 WHERE change_revision<9007199254740991')
    if (result.rowCount !== 1) throw new DataError(409)
    return true
  }, true)
  return { account: owner, seeded }
}

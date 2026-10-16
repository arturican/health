import { createApi } from '../../src/server/app'
import { registerAuthentication } from '../../src/server/auth'
import { registerProfile } from '../../src/server/profileRoutes'
import { registerWeights } from '../../src/server/weightRoutes'
import { registerProducts } from '../../src/server/productRoutes'
import { registerFood } from '../../src/server/foodRoutes'
import { registerNutrition } from '../../src/server/nutritionRoutes'
import { registerSteps } from '../../src/server/stepsRoutes'
import { registerWorkouts } from '../../src/server/workoutRoutes'
import { registerPlans } from '../../src/server/planRoutes'
import { registerFiles } from '../../src/server/fileRecords'
import { createUploadTransport } from '../../src/server/uploadTransport'
import { registerPhotos } from '../../src/server/photoRoutes'
import { registerDocuments } from '../../src/server/documentRoutes'
import { registerLabs } from '../../src/server/labRoutes'
import { registerSettings } from '../../src/server/settingsRoutes'
import { registerBackups } from '../../src/server/backupRoutes'
import { registerClear } from '../../src/server/clearRoutes'
import { testDatabase } from '../serverDatabase'
import { migrate, readMigrations } from '../../src/server/migrations'
import { createAccountMailer } from '../../src/server/accountMail'
import { accountMailSmtp } from '../accountMailSmtp'

export default async function setup() {
  const database = await testDatabase()
  const app = createApi()
  const smtp = await accountMailSmtp()
  const mail = createAccountMailer({ MAIL_ENABLED: 'true', MAIL_SMTP_PORT: String(smtp.port) })
  app.decorate('accountMail', mail)
  app.addHook('onClose', async () => { await mail?.close(); await smtp.close() })
  // Synthetic mailbox exists only in this local test server.
  app.get('/api/v1/test-mail', () => smtp.messages.map(raw => ({
    to: raw.match(/^To:\s*<?([^>\r\n]+)>?/mi)?.[1] ?? '',
    text: Buffer.from(raw.split('\r\n\r\n')[1] ?? '', 'base64').toString(),
  })))
  try {
    await migrate(database.pool, await readMigrations())
    const pool = database.runtime
    let windowOffset = 0
    const clock = () => new Date(Date.parse('2026-10-14T12:00:00Z') + windowOffset)
    app.get('/api/v1/test-auth-window', () => { windowOffset += 16 * 60 * 1000; return { advanced: true } })
    const authorize = await registerAuthentication(app, pool, 'http://127.0.0.1:4173', clock)
    const uploads = createUploadTransport(app, authorize)
    registerProfile(app, pool, authorize, clock)
    registerWeights(app, pool, authorize, clock)
    registerProducts(app, pool, authorize)
    registerFood(app, pool, authorize, clock)
    registerNutrition(app, pool, authorize, clock)
    registerSteps(app, pool, authorize, clock)
    registerWorkouts(app, pool, authorize, clock)
    registerPlans(app, pool, authorize, clock)
    registerFiles(app, pool, authorize)
    registerPhotos(app, pool, authorize, uploads, clock)
    registerDocuments(app, pool, authorize, uploads, clock)
    registerLabs(app, pool, authorize, clock)
    registerSettings(app, pool, authorize)
    registerBackups(app, pool, authorize, clock)
    registerClear(app, pool, authorize)
    await app.listen({ host: '127.0.0.1', port: 4181 })
    process.env['HEALTH_E2E_ADMIN_URL'] = database.pool.options.connectionString
    process.env['HEALTH_E2E_RUNTIME_URL'] = database.runtime.options.connectionString
    return async () => { await app.close(); await database.close() }
  } catch (error) { await app.close(); await database.close(); throw error }
}

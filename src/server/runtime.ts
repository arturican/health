import { createApi } from './app.js'
import { readDataConfig, readServerConfig } from './config.js'
import { createPool } from './database.js'
import { registerAuthentication } from './auth.js'
import { registerProfile } from './profileRoutes.js'
import { registerWeights } from './weightRoutes.js'
import { registerProducts } from './productRoutes.js'
import { registerFood } from './foodRoutes.js'
import { registerNutrition } from './nutritionRoutes.js'
import { registerSteps } from './stepsRoutes.js'
import { registerWorkouts } from './workoutRoutes.js'
import { registerPlans } from './planRoutes.js'
import { registerFiles } from './fileRecords.js'
import { createUploadTransport } from './uploadTransport.js'
import { registerPhotos } from './photoRoutes.js'
import { registerDocuments } from './documentRoutes.js'
import { registerLabs } from './labRoutes.js'
import { registerSettings } from './settingsRoutes.js'
import { registerBackups } from './backupRoutes.js'
import { registerClear } from './clearRoutes.js'
import { createAccountMailer } from './accountMail.js'
import { registerReadiness } from './readiness.js'

export async function startApi(environment: Record<string, string | undefined>) {
  const { trustLocalProxy, ...config } = readServerConfig(environment)
  const dataConfig = readDataConfig(environment)
  const app = createApi(trustLocalProxy)
  try {
    const mail = createAccountMailer(environment)
    app.decorate('accountMail', mail)
    if (mail) app.addHook('onClose', async () => { await mail.close() })
    if (dataConfig) {
      const pool = createPool(dataConfig.connectionString)
      app.addHook('onClose', async () => { await pool.end() })
      const authorize = await registerAuthentication(app, pool, dataConfig.origin)
      const uploads = createUploadTransport(app, authorize)
      registerProfile(app, pool, authorize)
      registerWeights(app, pool, authorize)
      registerProducts(app, pool, authorize)
      registerFood(app, pool, authorize)
      registerNutrition(app, pool, authorize)
      registerSteps(app, pool, authorize)
      registerWorkouts(app, pool, authorize)
      registerPlans(app, pool, authorize)
      registerFiles(app, pool, authorize)
      registerPhotos(app, pool, authorize, uploads)
      registerDocuments(app, pool, authorize, uploads)
      registerLabs(app, pool, authorize)
      registerSettings(app, pool, authorize)
      registerBackups(app, pool, authorize)
      registerClear(app, pool, authorize)
      registerReadiness(app, pool)
    } else registerReadiness(app, null)
    await app.listen(config)
    return await app
  } catch {
    await app.close()
    throw new Error('Не удалось запустить API')
  }
}

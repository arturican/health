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

export async function startApi(environment: Record<string, string | undefined>) {
  const config = readServerConfig(environment)
  const dataConfig = readDataConfig(environment)
  const app = createApi()
  try {
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
    }
    await app.listen(config)
    return await app
  } catch {
    await app.close()
    throw new Error('Не удалось запустить API')
  }
}

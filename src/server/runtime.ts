import { createApi } from './app.js'
import { readDataConfig, readServerConfig } from './config.js'
import { createPool } from './database.js'
import { registerAuthentication } from './auth.js'

export async function startApi(environment: Record<string, string | undefined>) {
  const config = readServerConfig(environment)
  const dataConfig = readDataConfig(environment)
  const app = createApi()
  try {
    if (dataConfig) {
      const pool = createPool(dataConfig.connectionString)
      app.addHook('onClose', async () => { await pool.end() })
      await registerAuthentication(app, pool, dataConfig.origin)
    }
    await app.listen(config)
    return await app
  } catch {
    await app.close()
    throw new Error('Не удалось запустить API')
  }
}

import { createApi } from './app.js'
import { readServerConfig } from './config.js'

export async function startApi(environment: Record<string, string | undefined>) {
  const config = readServerConfig(environment)
  const app = createApi()
  try {
    await app.listen(config)
    return await app
  } catch {
    await app.close()
    throw new Error('Не удалось запустить API')
  }
}

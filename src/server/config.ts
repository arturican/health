import { z } from 'zod'
import { databaseUrl } from './database.js'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  API_HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  API_PORT: z.string().regex(/^[0-9]{1,5}$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(3001),
})

export function readServerConfig(environment: Record<string, string | undefined>) {
  const result = configSchema.safeParse(environment)
  if (!result.success) throw new Error('Некорректные настройки API: NODE_ENV, API_HOST или API_PORT')
  return { host: result.data.API_HOST, port: result.data.API_PORT, trustLocalProxy: result.data.API_TRUST_PROXY === 'true' }
}

export function readDataConfig(environment: Record<string, string | undefined>) {
  if (!environment.DATABASE_URL && environment.NODE_ENV !== 'production') return null
  const connectionString = databaseUrl(environment.DATABASE_URL)
  try {
    const origin = new URL(environment.APP_ORIGIN ?? '')
    const local = environment.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    if (origin.origin !== environment.APP_ORIGIN || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) throw new Error()
    if (environment.NODE_ENV === 'production' && (environment.MIGRATION_DATABASE_URL || environment.ADMIN_PASSWORD)) throw new Error()
    return { connectionString, origin: origin.origin }
  } catch { throw new Error('Проверьте APP_ORIGIN и разделение серверных прав') }
}

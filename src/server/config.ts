import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  API_PORT: z.string().regex(/^[0-9]{1,5}$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(3001),
})

export function readServerConfig(environment: Record<string, string | undefined>) {
  const result = configSchema.safeParse(environment)
  if (!result.success) throw new Error('Некорректные настройки API: NODE_ENV, API_HOST или API_PORT')
  return { host: result.data.API_HOST, port: result.data.API_PORT }
}

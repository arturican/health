import { parseEnv } from 'node:util'

export const developmentSecretNames = ['DEV_POSTGRES_PASSWORD', 'DEV_APP_PASSWORD', 'DEV_MIGRATOR_PASSWORD', 'DEV_DEMO_PASSWORD']

export function readDevelopmentSecrets(text) {
  const env = parseEnv(text)
  if (Object.keys(env).length !== developmentSecretNames.length || developmentSecretNames.some(name => !/^[A-Za-z0-9_-]{15,}$/.test(env[name] ?? ''))) {
    throw new Error('Нужны только четыре DEV_*_PASSWORD из .env.example: минимум 15 символов A-Z, a-z, 0-9, _ или -.')
  }
  if (developmentSecretNames.some(name => env[name].startsWith('REPLACE_'))) {
    throw new Error('Проверьте четыре DEV_* пароля в .env; шаблон не является настройкой.')
  }
  return env
}

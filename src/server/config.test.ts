// @vitest-environment node
import { expect, it } from 'vitest'
import { readDataConfig, readServerConfig } from './config'

it('использует loopback и ограниченный порт по умолчанию', () => {
  expect(readServerConfig({})).toEqual({ host: '127.0.0.1', port: 3001 })
})

it.each(['1', '65535'])('принимает границу порта %s', port => {
  expect(readServerConfig({ API_HOST: '::1', API_PORT: port, NODE_ENV: 'production' })).toEqual({ host: '::1', port: Number(port) })
})

it.each(['', '0', '65536', '-1', '1.5', '1e3', ' 3001', 'secret-value'])('отклоняет порт без отражения значения: %s', port => {
  expect(() => readServerConfig({ API_PORT: port })).toThrow('Некорректные настройки API: NODE_ENV, API_HOST или API_PORT')
})

it.each([{ API_HOST: '0.0.0.0' }, { API_HOST: 'example.com' }, { NODE_ENV: 'invalid' }])('отклоняет неподдерживаемый интерфейс/режим', environment => {
  expect(() => readServerConfig(environment)).toThrow('Некорректные настройки API')
})

it('production требует отдельные реквизиты runtime и HTTPS origin', () => {
  const environment = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://app:synthetic@localhost/health', APP_ORIGIN: 'https://health.example.test' }
  expect(readDataConfig(environment)?.origin).toBe(environment.APP_ORIGIN)
  expect(() => readDataConfig({ ...environment, DATABASE_URL: '' })).toThrow()
  expect(() => readDataConfig({ ...environment, MIGRATION_DATABASE_URL: 'synthetic-admin' })).toThrow()
  expect(() => readDataConfig({ ...environment, ADMIN_PASSWORD: 'synthetic-admin' })).toThrow()
  for (const APP_ORIGIN of ['', 'http://health.example.test', 'https://health.example.test/', 'https://user:pass@health.example.test']) {
    expect(() => readDataConfig({ ...environment, APP_ORIGIN })).toThrow()
  }
  expect(readDataConfig({})).toBeNull()
  expect(readDataConfig({ ...environment, NODE_ENV: 'development', APP_ORIGIN: 'http://localhost:5173' })?.origin).toBe('http://localhost:5173')
})

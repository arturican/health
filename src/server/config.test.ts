// @vitest-environment node
import { expect, it } from 'vitest'
import { readServerConfig } from './config'

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

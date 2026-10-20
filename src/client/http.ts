import type { z } from 'zod'
import { beginRequest, getClientSession, setClientSession } from './session'

export class ApiError extends Error {
  constructor(readonly status: number, readonly code?: 'command_capacity') {
    super(status === 409 && code === 'command_capacity'
      ? 'Достигнут предел журнала действий. Сохранение временно недоступно. Данные и создание копии доступны. Обратитесь к администратору.'
      : status === 401 ? 'Сессия завершилась. Войдите снова.' : status === 403 ? 'Действие не разрешено. Обновите страницу.'
      : status === 409 ? 'Данные изменились. Обновите запись и повторите действие.'
        : status === 400 ? 'Проверьте введённые данные.' : status === 404 ? 'Запись не найдена.'
          : status === 413 ? 'Файл или копия превышает допустимый размер.' : status === 429 ? 'Слишком много запросов. Повторите позже.'
            : 'Сервер временно недоступен. Повторите действие.')
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE', headers?: HeadersInit, body?: BodyInit | null, anonymous?: boolean, expectedAccountId?: string }
export async function requestApi<T>(path: string, read: (response: Response) => Promise<T>, options: Options = {}): Promise<T> {
  const url = new URL(path, 'https://health.invalid')
  if (!path.startsWith('/api/v1/') || url.origin !== 'https://health.invalid' || !url.pathname.startsWith('/api/v1/') || url.hash || path.includes('\\')) {
    throw new Error('Недопустимый адрес API')
  }
  const session = getClientSession().session, method = options.method ?? 'GET'
  if (!options.anonymous && !session) throw new ApiError(401)
  const headers = new Headers(options.headers)
  if (method !== 'GET' && session) headers.set('X-CSRF-Token', session.csrf)
  const request = beginRequest()
  const timer = setTimeout(() => { request.controller.abort() }, 130000)
  try {
    const response = await fetch(path, { method, headers, body: options.body ?? null, credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', referrerPolicy: 'no-referrer', signal: request.controller.signal })
    request.assertCurrent()
    if (!response.ok) {
      if (response.status === 401 && !options.anonymous) setClientSession(null)
      const code = response.status === 409 && response.headers.get('X-Health-Error-Code') === 'command_capacity' ? 'command_capacity' : undefined
      throw new ApiError(response.status, code)
    }
    const owner = options.expectedAccountId ?? (options.anonymous ? null : session?.account.id)
    if (owner && response.headers.get('X-Account-Id') !== owner) {
      setClientSession(null)
      throw new ApiError(401)
    }
    const value = await read(response)
    request.assertCurrent()
    return value
  } catch (error) {
    if (error instanceof ApiError) throw error
    request.assertCurrent()
    throw new Error('Не удалось получить данные. Проверьте соединение и повторите действие.')
  } finally { clearTimeout(timer); request.finish() }
}

export function requestJSON<T>(path: string, schema: z.ZodType<T>, options: Omit<Options, 'body'> & { value?: unknown } = {}) {
  const headers = new Headers(options.headers)
  if (options.value !== undefined) headers.set('Content-Type', 'application/json')
  return requestApi(path, async response => {
    const value: unknown = await response.json()
    return schema.parse(value)
  }, {
    ...options, headers, body: options.value === undefined ? null : JSON.stringify(options.value),
  })
}

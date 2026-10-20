import Fastify from 'fastify'
import { CommandCapacityError, DataError } from './httpErrors.js'

export function createApi(trustLocalProxy = false) {
  const app = Fastify({
    logger: false,
    trustProxy: trustLocalProxy ? (address, hop) => hop === 0
      && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) : false,
    bodyLimit: 16 * 1024,
    connectionTimeout: 10000,
    requestTimeout: 120000,
  })

  app.addHook('onSend', (_request, reply, payload, done) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    done(null, payload)
  })
  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: { code: 'not_found', message: 'Маршрут не найден' } })
  })
  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof DataError) {
      const capacity = error instanceof CommandCapacityError
      if (capacity) reply.header('X-Health-Error-Code', 'command_capacity')
      return reply.code(error.statusCode).send({ error: {
        code: capacity ? 'command_capacity' : error.statusCode === 400 ? 'invalid_data' : error.statusCode === 404 ? 'not_found' : 'conflict', message: error.message,
      } })
    }
    const supplied = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined
    const status = supplied === 400 || supplied === 413 || supplied === 415 ? supplied : 500
    const code = status === 413 ? 'payload_too_large' : status === 415 ? 'unsupported_media_type' : status === 400 ? 'invalid_request' : 'internal_error'
    const message = status === 500 ? 'Не удалось выполнить запрос' : 'Проверьте формат и размер запроса'
    return reply.code(status).send({ error: { code, message } })
  })

  app.get('/api/v1/health', {
    schema: {
      response: {
        200: {
          type: 'object', additionalProperties: false, required: ['status'],
          properties: { status: { type: 'string', enum: ['ok'] } },
        },
      },
    },
  }, () => ({ status: 'ok' }))

  return app
}

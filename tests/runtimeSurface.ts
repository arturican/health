import { expect } from 'vitest'

const id = '10000000-0000-4000-8000-000000000099'
type Operation = readonly [method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, status: number]
const publicOperations: Operation[] = [
  ['GET', '/health', 200], ['GET', '/readiness', 200],
  ['POST', '/auth/login', 401], ['GET', '/auth/session', 401], ['POST', '/auth/logout', 204],
  ['POST', '/auth/email/register', 503], ['POST', '/auth/email/request', 503], ['POST', '/auth/email/complete', 503],
]
const privateOperations: Operation[] = [
  ['GET', '/auth/email', 200], ['POST', '/auth/email/bind', 503],
  ['GET', '/profile', 200], ['POST', '/profile', 400], ['PUT', '/profile', 400],
  ['GET', '/weights', 200], ['POST', '/weights', 400], ['PUT', '/weights/' + id, 400], ['DELETE', '/weights/' + id, 400],
  ['GET', '/products', 200], ['GET', '/products/' + id, 404], ['POST', '/products', 400], ['PUT', '/products/' + id, 400], ['POST', '/products/seed', 400],
  ['GET', '/food', 200], ['POST', '/food', 400], ['PUT', '/food/' + id, 400], ['DELETE', '/food/' + id, 400], ['POST', '/food/copy', 400],
  ['GET', '/nutrition-days/2000-01-01', 200], ['PUT', '/nutrition-days/2000-01-01', 400],
  ['GET', '/steps', 200], ['GET', '/steps/2000-01-01', 200], ['PUT', '/steps/2000-01-01', 400], ['DELETE', '/steps/2000-01-01', 400],
  ['GET', '/workouts', 200], ['POST', '/workouts', 400], ['PUT', '/workouts/' + id, 400], ['DELETE', '/workouts/' + id, 400],
  ['GET', '/energy-plans', 200], ['GET', '/energy-plans/effective/2000-01-01', 200], ['POST', '/energy-plans', 400],
  ['GET', '/files/' + id, 404],
  ['GET', '/photos', 200], ['POST', '/photos', 400], ['PUT', '/photos/' + id, 400], ['DELETE', '/photos/' + id, 400],
  ['GET', '/documents', 200], ['GET', '/documents/' + id, 404], ['GET', '/documents/' + id + '/results-count', 404],
  ['POST', '/documents', 400], ['PUT', '/documents/' + id, 400], ['DELETE', '/documents/' + id, 400],
  ['GET', '/lab-results', 200], ['POST', '/lab-results', 400], ['PUT', '/lab-results/' + id, 400], ['DELETE', '/lab-results/' + id, 400],
  ['GET', '/diary-state', 200], ['PUT', '/settings', 400], ['DELETE', '/diary', 400],
  ['GET', '/backup/text', 200], ['GET', '/backup/full', 200], ['POST', '/backup/text', 400], ['POST', '/backup/full', 400],
]

export async function verifyRuntimeSurface(base: string, origin: string, authenticated: Record<string, string>, owner: string) {
  expect(publicOperations.length + privateOperations.length).toBe(62)
  expect(new Set([...publicOperations, ...privateOperations].map(([method, path]) => method + path)).size).toBe(62)
  async function request(operation: Operation, headers: Record<string, string>) {
    const [method, path, status] = operation
    const response = await fetch(base + '/api/v1' + path, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: path === '/products/seed' ? '{"unexpected":true}' : '{}' }) })
    expect(response.status, method + ' ' + path).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    if (status === 404) {
      const body: unknown = await response.json()
      expect(body, method + ' ' + path).toEqual({ error: { code: 'not_found', message: 'Запись не найдена' } })
    } else await response.arrayBuffer()
    return response
  }
  for (const operation of publicOperations) await request(operation, {})
  for (const [method, path] of privateOperations) await request([method, path, 401], {})
  for (const operation of privateOperations) {
    const response = await request(operation, authenticated)
    expect(response.headers.get('x-account-id'), operation[0] + ' ' + operation[1]).toBe(owner)
  }
  for (const path of ['/test-mail', '/test-auth-window', '/auth/register']) {
    for (const method of ['GET', 'POST']) {
      const response = await fetch(base + '/api/v1' + path, { method, headers: { origin, ...authenticated } })
      expect(response.status, method + ' ' + path).toBe(404)
      await response.arrayBuffer()
    }
  }
}

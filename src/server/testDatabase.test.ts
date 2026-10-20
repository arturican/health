// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { testDatabase } from '../../tests/serverDatabase'

const { factory } = vi.hoisted(() => ({ factory: vi.fn<(value: string | undefined) => unknown>() }))
vi.mock('./database', () => ({ createPool: factory }))

function fakePool() {
  return { query: vi.fn<(sql: string) => Promise<{ rows: never[] }>>().mockResolvedValue({ rows: [] }),
    end: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) }
}
let admin: ReturnType<typeof fakePool>
let owner: ReturnType<typeof fakePool>
let runtime: ReturnType<typeof fakePool>
beforeEach(() => {
  vi.stubEnv('TEST_DATABASE_URL', 'postgresql://test:test@127.0.0.1:55432/health_test')
  admin = fakePool()
  owner = fakePool()
  runtime = fakePool()
  factory.mockReset().mockReturnValueOnce(admin).mockReturnValueOnce(owner).mockReturnValueOnce(runtime)
})
afterEach(() => { vi.unstubAllEnvs() })

function statements() { return admin.query.mock.calls.map(([sql]) => sql) }
function ownedName() {
  const create = statements().find(sql => sql.startsWith('CREATE ROLE '))
  const name = /^CREATE ROLE (health_(?:test|restore)_[a-f0-9]{32})_user /.exec(create ?? '')?.[1]
  if (!name) throw new Error('Expected generated synthetic namespace')
  return name
}

it('cleans a successfully created role after CREATE DATABASE fails and preserves the cause', async () => {
  const cause = new Error('synthetic CREATE DATABASE failure')
  admin.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(cause)
  await expect(testDatabase()).rejects.toBe(cause)
  const name = ownedName()
  expect(statements().filter(sql => sql.startsWith('DROP '))).toEqual(['DROP ROLE ' + name + '_user'])
  expect(admin.end).toHaveBeenCalledOnce()
})

it('does not drop an unacquired role or database on initial setup failure', async () => {
  const cause = new Error('synthetic role setup failure')
  admin.query.mockRejectedValueOnce(cause)
  await expect(testDatabase()).rejects.toBe(cause)
  expect(statements().some(sql => sql.startsWith('DROP '))).toBe(false)
  expect(admin.end).toHaveBeenCalledOnce()
})

it('preserves setup and all cleanup errors, including admin end', async () => {
  const cause = new Error('synthetic create failure')
  const drop = new Error('synthetic drop failure')
  const end = new Error('synthetic admin end failure')
  admin.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    .mockRejectedValueOnce(cause).mockRejectedValueOnce(drop)
  admin.end.mockRejectedValueOnce(end)
  const error: unknown = await testDatabase().catch((value: unknown) => value)
  expect(error).toBeInstanceOf(AggregateError)
  if (!(error instanceof AggregateError)) throw new Error('Expected AggregateError')
  expect(error.errors).toEqual([cause, drop, end])
})

it('attempts every teardown resource once even if pools and DROP DATABASE fail', async () => {
  const database = await testDatabase('health_restore')
  const name = ownedName()
  const runtimeFailure = new Error('synthetic runtime end')
  const ownerFailure = new Error('synthetic owner end')
  const dropFailure = new Error('synthetic drop database')
  runtime.end.mockRejectedValueOnce(runtimeFailure)
  owner.end.mockRejectedValueOnce(ownerFailure)
  admin.query.mockRejectedValueOnce(dropFailure)
  const first = database.close()
  const second = database.close()
  const caught = first.catch((value: unknown) => value)
  void second.catch(() => undefined)
  expect(second).toBe(first)
  const error: unknown = await caught
  expect(error).toBeInstanceOf(AggregateError)
  if (!(error instanceof AggregateError)) throw new Error('Expected AggregateError')
  expect(error.errors).toEqual([runtimeFailure, ownerFailure, dropFailure])
  expect(statements().filter(sql => sql.startsWith('DROP '))).toEqual([
    'DROP DATABASE ' + name, 'DROP ROLE ' + name + '_user',
  ])
  for (const pool of [runtime, owner, admin]) expect(pool.end).toHaveBeenCalledOnce()
})

it('cleans acquired resources when runtime pool construction fails', async () => {
  const cause = new Error('synthetic pool construction')
  factory.mockReset().mockReturnValueOnce(admin).mockReturnValueOnce(owner).mockImplementationOnce(() => { throw cause })
  await expect(testDatabase()).rejects.toBe(cause)
  const name = ownedName()
  expect(owner.end).toHaveBeenCalledOnce()
  expect(statements().filter(sql => sql.startsWith('DROP '))).toEqual([
    'DROP DATABASE ' + name, 'DROP ROLE ' + name + '_user',
  ])
  expect(admin.end).toHaveBeenCalledOnce()
})

it.each(['postgresql://test:test@db.example.test/health_test', 'postgresql://test:test@127.0.0.1/health'])(
  'rejects an unsafe target before creating any pool: %s', async url => {
  vi.stubEnv('TEST_DATABASE_URL', url)
  await expect(testDatabase()).rejects.toThrow('локальной health_test')
  expect(factory).not.toHaveBeenCalled()
})

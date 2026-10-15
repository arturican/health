// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createAccount, type Account } from './accounts'
import { withUser } from './userTransaction'
import { migrate, readMigrations } from './migrations'
import { testDatabase } from '../../tests/serverDatabase'

let database: Awaited<ReturnType<typeof testDatabase>>
let alice: Account
let bob: Account
const id = '10000000-0000-4000-8000-000000000001'
beforeEach(async () => {
  database = await testDatabase()
  await migrate(database.pool, await readMigrations())
  alice = await createAccount(database.pool, { login: 'alice', password: 'synthetic-only-password', timezone: 'Europe/Moscow' })
  bob = await createAccount(database.pool, { login: 'bob', password: 'synthetic-only-password', timezone: 'UTC' })
  for (const account of [alice, bob]) await withUser(database.runtime, account, async client => {
    await client.query('INSERT INTO health.profiles(user_id,name,height_cm,formula_sex) VALUES ($1,$2,170,$3)', [account.id, account.login, 'none'])
    await client.query('INSERT INTO health.weights(user_id,id,date,kg) VALUES ($1,$2,$3,$4)', [account.id, id, '2026-10-01', account === alice ? 72.5 : 81])
  }, true)
})
afterEach(async () => { await database.close() })

it('каждый владелец видит только своё измерение даже с одинаковым UUID', async () => {
  for (const account of [alice, bob]) {
    const result = await withUser(database.runtime, account, client => client.query('SELECT user_id, id FROM health.weights'))
    expect(result.rows).toEqual([{ user_id: account.id, id }])
  }
  expect((await database.runtime.query('SELECT * FROM health.weights')).rowCount).toBe(0)
  expect((await database.runtime.query('SELECT * FROM health.profiles')).rowCount).toBe(0)
})

it('нельзя подменить владельца, изменить или удалить чужие строки', async () => {
  await withUser(database.runtime, alice, async client => {
    expect((await client.query('UPDATE health.weights SET kg=90 WHERE user_id=$1', [bob.id])).rowCount).toBe(0)
    expect((await client.query('DELETE FROM health.weights WHERE user_id=$1', [bob.id])).rowCount).toBe(0)
  }, true)
  await expect(withUser(database.runtime, alice, client => client.query('INSERT INTO health.weights(user_id,id,date,kg) VALUES ($1,$2,$3,70)', [bob.id, randomUUID(), '2026-10-02']), true)).rejects.toMatchObject({ code: '42501' })
  await expect(withUser(database.runtime, alice, client => client.query('UPDATE health.weights SET user_id=$1', [bob.id]), true)).rejects.toMatchObject({ code: '42501' })
})

it('проверяет уникальность даты и границы, сохраняет маленькое число', async () => {
  const insert = (date: string, kg: string) => withUser(database.runtime, alice, client => client.query('INSERT INTO health.weights(user_id,id,date,kg) VALUES ($1,$2,$3,$4)', [alice.id, randomUUID(), date, kg]), true)
  await expect(insert('2026-10-01', '70')).rejects.toMatchObject({ code: '23505' })
  for (const kg of ['0', '-1', '601', 'NaN', 'Infinity']) await expect(insert('2026-10-02', kg)).rejects.toMatchObject({ code: '23514' })
  await expect(insert('0001-01-01 BC', '70')).rejects.toMatchObject({ code: '23514' })
  await insert('2026-10-02', '0.000000000000000001')
  const rows = await withUser(database.runtime, alice, client => client.query('SELECT kg::text FROM health.weights WHERE date=$1', ['2026-10-02']))
  expect(rows.rows).toEqual([{ kg: '0.000000000000000001' }])
})

it('rollback не оставляет запись или контекст в pool, read-only запрещает запись', async () => {
  await expect(withUser(database.runtime, alice, async client => {
    await client.query('DELETE FROM health.weights')
    throw new Error('synthetic rollback')
  }, true)).rejects.toThrow('synthetic rollback')
  expect((await withUser(database.runtime, alice, client => client.query('SELECT * FROM health.weights'))).rowCount).toBe(1)
  expect((await database.runtime.query('SELECT * FROM health.weights')).rowCount).toBe(0)
  await expect(withUser(database.runtime, alice, client => client.query('DELETE FROM health.weights'))).rejects.toMatchObject({ code: '25006' })
})

it('удаление аккаунта каскадно убирает его профиль и вес, сохраняя другого', async () => {
  await database.pool.query('DELETE FROM health.users WHERE id=$1', [alice.id])
  expect((await database.pool.query('SELECT user_id FROM health.profiles')).rows).toEqual([{ user_id: bob.id }])
  expect((await database.pool.query('SELECT user_id FROM health.weights')).rows).toEqual([{ user_id: bob.id }])
})
